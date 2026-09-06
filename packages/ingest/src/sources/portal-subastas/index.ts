import {
  FichaPortal,
  PATRON_IDENTIFICADOR_SUBASTA,
  bienesDeFicha,
} from '@subastas/core';
import { fetchTexto } from '../../http';
import { escribirCache, leerCache } from './cache';
import {
  cookieDeSesion,
  haySesionConfigurada,
  importeReservado,
  olvidarSesion,
} from './sesion';
import {
  parsearAdjuntos,
  parsearAutoridad,
  parsearBienes,
  parsearDatosSubasta,
  parsearImportesLote,
  parsearPujas,
} from './parser';

/**
 * Lector de fichas del Portal de Subastas — SOLO BAJO DEMANDA.
 *
 * `subastas.boe.es/robots.txt` es `Disallow: /`, así que aquí no hay ni habrá
 * ninguna función que recorra el catálogo. Este módulo únicamente sabe leer UNA
 * subasta identificada por su `SUB-*`, que es lo que ocurre cuando el usuario
 * abre esa subasta en la app. Equivale a abrirla en el navegador.
 *
 * Si algún día hace falta procesar varias, que sea el llamante quien lo pida
 * explícitamente subasta por subasta, y nunca en paralelo: `http.ts` serializa
 * por host y respeta INGEST_RATE_LIMIT_MS.
 */

const BASE = 'https://subastas.boe.es/detalleSubasta.php';

/** Pestañas: 1 datos · 2 autoridad gestora · 3 bienes · 5 pujas. */
const PESTANAS = { datos: 1, autoridad: 2, bienes: 3, pujas: 5 } as const;

export class PortalDesactivadoError extends Error {
  constructor() {
    super('El acceso al Portal está desactivado (INGEST_PORTAL_ENABLED=false).');
    this.name = 'PortalDesactivadoError';
  }
}

function portalHabilitado(): boolean {
  // Habilitado por defecto: la decisión del proyecto es consultarlo bajo demanda.
  return process.env.INGEST_PORTAL_ENABLED !== 'false';
}

/**
 * Vigencia de la pestaña de pujas. El resto de pestañas valen todo el día
 * (fechas, bienes y autoridad no se mueven), pero el importe de la puja sí:
 * mientras la subasta está viva cambia, y solo se ve con sesión iniciada.
 */
const VIGENCIA_PUJAS_MS = Number(process.env.PORTAL_VIGENCIA_PUJAS_MS ?? 15 * 60 * 1000);

async function pedir(url: string): Promise<string> {
  const cookie = await cookieDeSesion();
  return fetchTexto(url, cookie ? { headers: { Cookie: cookie } } : undefined);
}

async function obtenerPestana(id: string, ver: number, idLote?: number): Promise<string> {
  const url =
    idLote === undefined
      ? `${BASE}?idSub=${encodeURIComponent(id)}&ver=${ver}&idBus=&idLote=&numPagBus=`
      : `${BASE}?idSub=${encodeURIComponent(id)}&ver=${ver}&idLote=${idLote}&idBus=&numPagBus=`;

  /* La vigencia corta SOLO tiene sentido con sesión: sin ella el importe no
     aparece por mucho que se relea, así que releer sería tráfico regalado a un
     sitio con Disallow. Sin credenciales, todo sigue cacheado un día. */
  const conSesion = ver === PESTANAS.pujas && haySesionConfigurada();
  const cacheado = leerCache(url, conSesion ? VIGENCIA_PUJAS_MS : undefined);

  /* Y una pestaña guardada con el importe tapado no vale teniendo credenciales:
     es justo el dato que se venía a buscar. */
  if (cacheado !== null && !(conSesion && importeReservado(cacheado))) {
    return cacheado;
  }

  const html = await pedir(url);

  /* La sesión del Portal caduca sola, y renovarla exige un código por SMS: no
     se puede reintentar aquí. Lo único sensato es tirar la sesión muerta para
     no seguir mandando una cookie inútil, y dejar que la ficha se guarde con lo
     que el Portal enseña a un anónimo — que es la verdad: "hay pujas, importe
     reservado". El aviso de volver a entrar lo da la web. */
  if (haySesionConfigurada() && importeReservado(html)) {
    olvidarSesion();
  }

  escribirCache(url, html);
  return html;
}

/** Tope de lotes que se leen, por si alguna ficha declara una barbaridad. */
const MAX_LOTES = 30;

/**
 * Lee SOLO la pestaña de pujas de UNA subasta: **una petición**, frente a las
 * cuatro (o más, con lotes) de la ficha completa.
 *
 * Es lo que hace falta para seguir una subasta viva: de la ficha solo cambia la
 * puja. Sigue siendo lectura por identificador, nunca un recorrido.
 */
export async function obtenerPujasSubasta(
  identificador: string,
  idLote?: number,
): Promise<{
  pujaMaxima: number | null;
  situacionPuja: ReturnType<typeof parsearPujas>['situacionPuja'];
  lote: number | null;
  estadoTexto: string | null;
  capturadoEn: string;
}> {
  if (!portalHabilitado()) throw new PortalDesactivadoError();

  const id = identificador.trim().toUpperCase();
  if (!new RegExp(`^${PATRON_IDENTIFICADOR_SUBASTA.source}$`).test(id)) {
    throw new Error(`Identificador de subasta no válido: ${identificador}`);
  }

  const { pujaMaxima, situacionPuja, lote, estadoTexto } = parsearPujas(
    await obtenerPestana(id, PESTANAS.pujas, idLote),
  );

  return {
    pujaMaxima,
    situacionPuja,
    /* El lote que diga la página manda sobre el pedido: si el Portal enseña
       otro, es el suyo el que describe la cifra. */
    lote: lote ?? idLote ?? null,
    estadoTexto,
    capturadoEn: new Date().toISOString(),
  };
}

/**
 * Lee la ficha de UNA subasta.
 *
 * Con `basica: true` se leen **solo datos y bienes**: importes, fechas,
 * dirección y referencia catastral, que es lo que necesitan el listado, los
 * filtros, el mapa y Catastro. Son 2 peticiones en vez de 4 (una por lote si
 * los hay, en ambos casos). Se deja fuera la autoridad gestora y las pujas, que
 * se leen al abrir la ficha.
 *
 * ⚠️ Los lotes se leen TODOS aunque sea básica. Es tentador leer solo el
 * primero, pero los importes de la subasta son la suma de los lotes: con uno de
 * siete, el listado enseñaría el precio de una parte como si fuera el del
 * conjunto — el mismo error que ya costó caro con las cargas y con las pujas.
 *
 * @throws PortalDesactivadoError si INGEST_PORTAL_ENABLED=false
 */
export async function obtenerFichaSubasta(
  identificador: string,
  opciones: { basica?: boolean } = {},
): Promise<FichaPortal> {
  if (!portalHabilitado()) throw new PortalDesactivadoError();

  const id = identificador.trim().toUpperCase();
  if (!new RegExp(`^${PATRON_IDENTIFICADOR_SUBASTA.source}$`).test(id)) {
    throw new Error(`Identificador de subasta no válido: ${identificador}`);
  }

  const basica = opciones.basica === true;

  const htmlDatos = await obtenerPestana(id, PESTANAS.datos);
  const datos = parsearDatosSubasta(htmlDatos);

  // El Portal responde 200 con una página de error para identificadores que no
  // existen; se detecta porque no aparece el identificador en la tabla.
  if (!datos.identificador) {
    throw new Error(`El Portal no devolvió datos para ${id} (¿identificador inexistente?)`);
  }

  const htmlAutoridad = basica ? null : await obtenerPestana(id, PESTANAS.autoridad);
  const htmlPujas = basica ? null : await obtenerPestana(id, PESTANAS.pujas);
  const autoridad = htmlAutoridad ? parsearAutoridad(htmlAutoridad) : null;
  const pujas = htmlPujas
    ? parsearPujas(htmlPujas)
    : {
        pujaMaximaTexto: null,
        pujaMaxima: null,
        situacionPuja: null,
        estadoTexto: null,
      };

  /**
   * Con lotes, cada uno tiene su página con SUS importes; la pestaña general
   * solo dice "Ver valor de subasta en cada lote". Sin lotes hay un único lote
   * implícito cuyos importes son los de la subasta.
   */
  const lotes = [];

  /* Los adjuntos (fotos y PDF) salen gratis del HTML que ya se ha descargado:
     ni una petición más.

     ⚠️ NO están en la pestaña de bienes, que es donde parecía lógico buscarlos.
     Medido sobre las 34 subastas con fotos: 31 las traen en `ver=1` (datos) y
     solo 3 en `ver=3`. Los PDF aparecen repartidos por varias pestañas. Por eso
     se escanean TODAS, y se acumulan por docId para no duplicar. */
  const adjuntos = new Map<string, { docId: string; titulo: string; tipo: 'FOTO' | 'DOCUMENTO' }>();

  const recogerAdjuntos = (html: string): void => {
    const { fotos, documentos } = parsearAdjuntos(html);
    for (const f of fotos) {
      if (!adjuntos.has(f.docId)) adjuntos.set(f.docId, { ...f, tipo: 'FOTO' });
    }
    for (const d of documentos) {
      if (!adjuntos.has(d.docId)) adjuntos.set(d.docId, { ...d, tipo: 'DOCUMENTO' });
    }
  };

  recogerAdjuntos(htmlDatos);
  if (htmlAutoridad) recogerAdjuntos(htmlAutoridad);
  if (htmlPujas) recogerAdjuntos(htmlPujas);

  if (datos.numeroLotes > 0) {
    for (let n = 1; n <= Math.min(datos.numeroLotes, MAX_LOTES); n++) {
      const html = await obtenerPestana(id, PESTANAS.bienes, n);
      recogerAdjuntos(html);
      lotes.push({
        numero: n,
        ...parsearImportesLote(html),
        bienes: parsearBienes(html),
      });
    }
  } else {
    const html = await obtenerPestana(id, PESTANAS.bienes);
    recogerAdjuntos(html);
    lotes.push({
      numero: 1,
      valorSubasta: datos.valorSubasta,
      tasacion: datos.tasacion,
      pujaMinima: datos.pujaMinima,
      importeDeposito: datos.importeDeposito,
      tramosEntrePujas: datos.tramosEntrePujas,
      bienes: parsearBienes(html),
    });
  }

  return FichaPortal.parse({
    ...datos,
    identificador: datos.identificador,
    ...pujas,
    autoridad,
    lotes,
    adjuntos: [...adjuntos.values()],
    nivelLectura: basica ? 'BASICA' : 'COMPLETA',
    capturadoEn: new Date().toISOString(),
  });
}

/**
 * Importes representativos de la subasta. Con varios lotes la ficha general no
 * los trae, así que se agregan: la suma es lo que costaría llevarse todo.
 */
export function importesAgregados(ficha: FichaPortal): {
  valorSubasta: number | null;
  tasacion: number | null;
  importeDeposito: number | null;
} {
  if (ficha.numeroLotes === 0) {
    return {
      valorSubasta: ficha.valorSubasta,
      tasacion: ficha.tasacion,
      importeDeposito: ficha.importeDeposito,
    };
  }

  const sumar = (f: (l: (typeof ficha.lotes)[number]) => number | null) => {
    const valores = ficha.lotes.map(f).filter((v): v is number => v !== null);
    return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) : null;
  };

  return {
    valorSubasta: sumar((l) => l.valorSubasta),
    tasacion: sumar((l) => l.tasacion),
    importeDeposito: sumar((l) => l.importeDeposito),
  };
}

/** Referencias catastrales de la ficha: lo que encadena con Catastro. */
export function referenciasDeFicha(ficha: FichaPortal): string[] {
  return [
    ...new Set(
      bienesDeFicha(ficha)
        .map((b) => b.referenciaCatastral)
        .filter((r): r is string => r !== null && r.length >= 14),
    ),
  ];
}

/** URL del fichero original de un adjunto (foto a tamaño completo o PDF). */
export function urlAdjunto(identificador: string, docId: string): string {
  return `https://subastas.boe.es/verDocumento.php?idSub=${encodeURIComponent(
    identificador,
  )}&idDoc=${encodeURIComponent(docId)}`;
}

export {
  parsearAdjuntos,
  parsearBienes,
  parsearDatosSubasta,
  parsearAutoridad,
  parsearPujas,
  parsearImportesLote,
};

export type { SituacionPuja } from './parser';
