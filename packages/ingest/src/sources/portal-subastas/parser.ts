import * as cheerio from 'cheerio';
import {
  parseImporteES,
  parseImporteEstricto,
  type AutoridadGestora,
  type BienPortal,
} from '@subastas/core';

/**
 * Parseo de las fichas del Portal. Todas las pestañas usan la misma forma:
 *   <table><tr><th>Etiqueta</th><td>Valor</td></tr>...</table>
 * así que se extrae a un diccionario etiqueta → valor y se leen los campos.
 */

/** Normaliza acentos rotos, dobles espacios y espacios no separables. */
function limpiar(texto: string): string {
  return texto
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae los pares th/td de todas las tablas.
 *
 * Devuelve un array y no un objeto porque en la pestaña de bienes las
 * etiquetas se repiten (un "Dirección" por bien) y un objeto las machacaría.
 */
function paresDeTablas($: cheerio.CheerioAPI): Array<{ clave: string; valor: string }> {
  const pares: Array<{ clave: string; valor: string }> = [];

  $('table tr').each((_, tr) => {
    const th = $(tr).find('th').first();
    const td = $(tr).find('td').first();
    if (th.length === 0 || td.length === 0) return;

    pares.push({ clave: limpiar(th.text()), valor: limpiar(td.text()) });
  });

  return pares;
}

const buscar = (
  pares: Array<{ clave: string; valor: string }>,
  patron: RegExp,
): string | null => {
  const p = pares.find((x) => patron.test(x.clave));
  if (!p) return null;
  const v = p.valor.trim();
  return v === '' ? null : v;
};

/** "No consta", "Sin lotes", "Sin puja mínima"... equivalen a ausencia de dato. */
const AUSENTE = /^(no consta|sin (lotes|puja m[íi]nima|datos)|-{1,2})$/i;
const oNull = (v: string | null): string | null =>
  v === null || AUSENTE.test(v.trim()) ? null : v;

/**
 * El Portal muestra la fecha local y su equivalente ISO en el mismo td:
 *   "28-07-2026 18:00:00 CET  (ISO: 2026-07-28T18:00:00+02:00)"
 * Se toma el ISO, que ya viene con offset y no hay que interpretar.
 */
function extraerIso(valor: string | null): string | null {
  if (!valor) return null;
  const m = valor.match(/ISO:\s*([0-9T:+\-]+)/);
  return m ? m[1]! : null;
}

// ---------------------------------------------------------------------------
// ver=1 — Datos de la subasta
// ---------------------------------------------------------------------------
export function parsearDatosSubasta(html: string) {
  const $ = cheerio.load(html);
  const p = paresDeTablas($);

  /**
   * "Sin lotes" o un número. Con lotes, los importes de esta pestaña son textos
   * del tipo "Ver valor de subasta en cada lote": `parseImporteES` devuelve
   * null ante ellos, que es justo lo que queremos.
   */
  const lotesTexto = buscar(p, /^Lotes$/i);
  const numeroLotes = lotesTexto && /^\d+$/.test(lotesTexto.trim())
    ? Number(lotesTexto.trim())
    : 0;

  return {
    numeroLotes,
    identificador: buscar(p, /^Identificador$/i),
    tipoSubasta: oNull(buscar(p, /^Tipo de subasta$/i)),
    cuentaExpediente: oNull(buscar(p, /Cuenta expediente/i)),
    fechaInicio: extraerIso(buscar(p, /Fecha de inicio/i)),
    fechaConclusion: extraerIso(buscar(p, /Fecha de conclusi/i)),
    anuncioBoe: oNull(buscar(p, /Anuncio BOE/i)),
    cantidadReclamada: parseImporteES(buscar(p, /Cantidad reclamada/i)),
    valorSubasta: parseImporteES(buscar(p, /Valor subasta/i)),
    tasacion: parseImporteES(buscar(p, /Tasaci/i)),
    pujaMinima: parseImporteES(oNull(buscar(p, /Puja m[íi]nima/i))),
    situacionPujaMinima: situacionPujaMinima(buscar(p, /Puja m[íi]nima/i)),
    tramosEntrePujas: parseImporteES(buscar(p, /Tramos entre pujas/i)),
    importeDeposito: parseImporteES(buscar(p, /Importe del dep/i)),
  };
}

/**
 * ⚠️ **«Sin puja mínima» NO es lo mismo que «no consta»** — es lo contrario.
 *
 * Es el dato que decide cuánto hay que pujar, y sin cifra quedaba en NULL igual
 * que un campo no informado. La ficha ponía «No consta» en **983 de las 1.630
 * fichas leídas**, cuando el Portal afirma expresamente que NO hay suelo: se
 * admite cualquier puja.
 *
 * | Texto del Portal | Medido | Significa |
 * |---|---:|---|
 * | `Sin puja mínima` | 983 | no hay suelo |
 * | una cifra | 482 | por debajo no se admite |
 * | `Ver puja mínima de cada lote` | 165 | va por lote, no aquí |
 */
export type SituacionPujaMinima = 'IMPORTE' | 'SIN_MINIMA' | 'POR_LOTE';

function situacionPujaMinima(texto: string | null): SituacionPujaMinima | null {
  if (texto === null) return null;
  const t = texto.trim();
  if (t === '') return null;
  if (/sin puja m[íi]nima/i.test(t)) return 'SIN_MINIMA';
  if (/de cada lote/i.test(t)) return 'POR_LOTE';
  return parseImporteES(t) !== null ? 'IMPORTE' : null;
}

// ---------------------------------------------------------------------------
// ver=2 — Autoridad gestora
// ---------------------------------------------------------------------------
export function parsearAutoridad(html: string): AutoridadGestora {
  const $ = cheerio.load(html);
  const p = paresDeTablas($);

  return {
    codigo: oNull(buscar(p, /^C[óo]digo$/i)),
    descripcion: oNull(buscar(p, /^Descripci/i)),
    direccion: oNull(buscar(p, /^Direcci/i)),
    telefono: oNull(buscar(p, /^Tel[ée]fono$/i)),
    correo: oNull(buscar(p, /Correo electr/i)),
  };
}

// ---------------------------------------------------------------------------
// ver=3 — Bienes
// ---------------------------------------------------------------------------

/**
 * Una subasta puede sacar varios bienes, cada uno con su bloque de campos
 * precedido por un encabezado "Bien N - Inmueble (Vivienda)". Se trocea por
 * esos encabezados en vez de asumir un único bien.
 */
export function parsearBienes(html: string): BienPortal[] {
  const $ = cheerio.load(html);

  const encabezados: Array<{ indice: number; tipo: string | null }> = [];
  $('h4, h3, caption, legend').each((_, el) => {
    const t = limpiar($(el).text());
    const m = t.match(/^Bien\s+(\d+)\s*[-–]\s*(.+)$/i);
    if (m) encabezados.push({ indice: Number(m[1]), tipo: m[2]!.trim() });
  });

  const pares = paresDeTablas($);

  // Con un solo bien (el caso normal) todos los pares le pertenecen.
  if (encabezados.length <= 1) {
    const bien = bienDesdePares(pares, 1, encabezados[0]?.tipo ?? null);
    return bien ? [bien] : [];
  }

  // Con varios, se reparten los pares por orden de aparición de "Dirección".
  const bienes: BienPortal[] = [];
  const cortes: number[] = [];
  pares.forEach((par, i) => {
    if (/^Descripci/i.test(par.clave)) cortes.push(i);
  });

  for (let k = 0; k < cortes.length; k++) {
    const desde = cortes[k]!;
    const hasta = cortes[k + 1] ?? pares.length;
    const bien = bienDesdePares(
      pares.slice(desde, hasta),
      k + 1,
      encabezados[k]?.tipo ?? null,
    );
    if (bien) bienes.push(bien);
  }

  return bienes;
}

/**
 * Adjuntos de la pestaña de bienes: fotografías del inmueble y documentos.
 *
 * Este es el único sitio donde el Portal publica **fotos reales del bien**, y
 * cuesta encontrarlo porque va aparte de las tablas th/td:
 *
 *   <h5 class="legend">Imágenes y fotografías</h5>
 *     <a href="verDocumento.php?idSub=..&idDoc=..">
 *       <img src="verThumbnail.php?idSub=..&idDoc=.." alt="FOTO 01"/>
 *
 * Los documentos (certificación de cargas, nota simple, edicto) van en
 * <li class="puntoPDF">. La certificación de cargas es lo más valioso de toda
 * la ficha: es justo el dato que suele quedar en "no consta".
 *
 * Solo se extraen los identificadores; descargar los ficheros es otro paso.
 */
export function parsearAdjuntos(html: string): {
  fotos: Array<{ docId: string; titulo: string }>;
  documentos: Array<{ docId: string; titulo: string }>;
} {
  const $ = cheerio.load(html);

  const fotos: Array<{ docId: string; titulo: string }> = [];
  const vistas = new Set<string>();

  $('img.imgThumbnail, img[src*="verThumbnail.php"]').each((_, el) => {
    const src = $(el).attr('src') ?? '';
    const docId = new URL(src, 'https://subastas.boe.es/').searchParams.get('idDoc');
    if (!docId || vistas.has(docId)) return;
    vistas.add(docId);
    fotos.push({
      docId,
      titulo: limpiar($(el).attr('alt') ?? $(el).attr('title') ?? `Foto ${fotos.length + 1}`),
    });
  });

  const documentos: Array<{ docId: string; titulo: string }> = [];
  const vistosDoc = new Set<string>();

  $('li.puntoPDF a[href*="verDocumento.php"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const docId = new URL(href, 'https://subastas.boe.es/').searchParams.get('idDoc');
    if (!docId || vistosDoc.has(docId)) return;
    vistosDoc.add(docId);
    documentos.push({ docId, titulo: limpiar($(el).text()) || 'Documento' });
  });

  return { fotos, documentos };
}

function bienDesdePares(
  pares: Array<{ clave: string; valor: string }>,
  numero: number,
  tipo: string | null,
): BienPortal | null {
  const descripcion = oNull(buscar(pares, /^Descripci/i));
  const direccion = oNull(buscar(pares, /^Direcci/i));

  // Sin ninguno de los dos no hay bien que registrar (pestaña vacía o sin acceso).
  if (!descripcion && !direccion) return null;

  const viviendaHabitualTexto = buscar(pares, /Vivienda habitual/i);

  /**
   * Ojo con el matiz: en las cargas, `null` significa "el Portal no lo informó",
   * que NO es lo mismo que "libre de cargas". Se normaliza a null por coherencia
   * con el resto de campos, pero quien muestre esto debe decir "no consta", nunca
   * "sin cargas".
   */
  const cargas = oNull(buscar(pares, /^Cargas$/i));

  return {
    numero,
    tipo,
    descripcion,
    referenciaCatastral: oNull(buscar(pares, /Referencia catastral/i)),
    idufir: oNull(buscar(pares, /IDUFIR|C[óo]digo Registral/i)),
    direccion,
    codigoPostal: oNull(buscar(pares, /C[óo]digo Postal/i)),
    localidad: oNull(buscar(pares, /^Localidad$/i)),
    provincia: oNull(buscar(pares, /^Provincia$/i)),
    viviendaHabitual: viviendaHabitualTexto
      ? /^s[íi]$/i.test(viviendaHabitualTexto.trim())
      : null,
    situacionPosesoria: oNull(buscar(pares, /Situaci[óo]n posesoria/i)),
    visitable: oNull(buscar(pares, /^Visitable$/i)),
    cargas,
    /* Las cargas a veces vienen como importe ("22.321,05 €") y a veces como
       prosa ("Ver certificación de cargas", "Prohibición de disponer…"). De ahí
       el parser ESTRICTO: con el laxo, los números de expediente y las fechas
       del texto se pegaban en un solo importe absurdo. */
    cargasImporte: parseImporteEstricto(cargas),
    inscripcionRegistral: oNull(buscar(pares, /Inscripci[óo]n registral/i)),
    tituloJuridico: oNull(buscar(pares, /T[íi]tulo jur[íi]dico/i)),
    informacionAdicional: oNull(buscar(pares, /Informaci[óo]n adicional/i)),
  };
}

/**
 * ver=3&idLote=N — Importes propios de un lote.
 *
 * La página del lote repite la estructura de tabla th/td, pero con las
 * etiquetas en otra forma: "Valor Subasta" y "Valor de tasación" en vez de
 * "Valor subasta" y "Tasación".
 */
export function parsearImportesLote(html: string): {
  valorSubasta: number | null;
  tasacion: number | null;
  pujaMinima: number | null;
  situacionPujaMinima: SituacionPujaMinima | null;
  importeDeposito: number | null;
  tramosEntrePujas: number | null;
} {
  const $ = cheerio.load(html);
  const p = paresDeTablas($);

  // Una tasación de 0,00 € es "no informada", no un inmueble que vale nada.
  const tasacion = parseImporteES(buscar(p, /Valor de tasaci/i));

  return {
    valorSubasta: parseImporteES(buscar(p, /Valor Subasta/i)),
    tasacion: tasacion === 0 ? null : tasacion,
    pujaMinima: parseImporteES(oNull(buscar(p, /Puja m[íi]nima/i))),
    situacionPujaMinima: situacionPujaMinima(buscar(p, /Puja m[íi]nima/i)),
    importeDeposito: parseImporteES(buscar(p, /Importe del dep/i)),
    tramosEntrePujas: parseImporteES(buscar(p, /Tramos entre pujas/i)),
  };
}

// ---------------------------------------------------------------------------
// ver=5 — Pujas
// ---------------------------------------------------------------------------

/**
 * ⚠️ **El Portal no publica el importe de la puja a los visitantes anónimos
 * mientras la subasta está en curso.** Solo lo hace al concluir — salvo que
 * haya sesión iniciada, y entonces sí (ver `sesion.ts`). Medido sobre 262
 * pestañas de subastas vivas leídas sin sesión: 0 traen cifra. Lo que traen es
 * una de estas tres frases:
 *
 * | Frase | Medido | Significa |
 * |---|---:|---|
 * | «La subasta no ha recibido pujas.» | 218 | consta que NO hay pujas |
 * | «La subasta ha recibido alguna puja. Para ver su importe…» | 43 | SÍ hay pujas, importe reservado a usuarios registrados |
 * | «La puja máxima de la subasta es secreta.» | 1 | hay o puede haber, y no se dirá |
 *
 * Distinguirlas es obligatorio: quedarse con "hay cifra o no" metía esas 44 en
 * el mismo saco que las vacías y la ficha decía «Sin pujas» de subastas que
 * expresamente declaran tenerlas. Mismo criterio que con las cargas — la
 * ausencia de dato NUNCA se muestra como ausencia de hecho.
 */
export type SituacionPuja = 'CONOCIDA' | 'SIN_PUJAS' | 'OCULTA' | 'SECRETA';

/**
 * Esta pestaña NO siempre usa tabla: en las subastas concluidas el importe va
 * en texto plano, y la etiqueta cambia de forma
 * ("Puja máxima actual de la subasta" mientras está en curso,
 *  "Puja máxima de la subasta" una vez concluida).
 * Buscar solo en tablas perdía la puja. Se trabaja sobre el texto.
 */
export function parsearPujas(html: string): {
  pujaMaximaTexto: string | null;
  pujaMaxima: number | null;
  situacionPuja: SituacionPuja | null;
  /** Nº de lote al que se refiere la cifra, o null si la subasta no los separa. */
  lote: number | null;
  estadoTexto: string | null;
} {
  const $ = cheerio.load(html);
  $('script, style').remove();
  const texto = limpiar($.text());

  /* ⚠️ TRES plantillas, no una. Cambian con la sesión y con los lotes:
       anónimo             → "Puja máxima [actual] de la subasta 12.345,67 €"
       con sesión          → "Importe de la puja más alta en esta subasta: 12.345,67 €"
       con sesión y lotes  → "…en el lote 1 de esta subasta: 12.345,67 €"
     La segunda y la tercera son las únicas que aparecen con la subasta viva. */
  const conPuja =
    texto.match(/Puja m[áa]xima(?:\s+actual)?\s+de la subasta\s*([\d.]+,\d{2})\s*€/i) ??
    texto.match(
      /Importe de la puja m[áa]s alta en (?:esta subasta|el lote \d+ de esta subasta):?\s*([\d.]+,\d{2})\s*€/i,
    );

  /* Con lotes la cifra es DE UN LOTE, no de la subasta: la pestaña muestra el
     que esté seleccionado. Guardarla como puja de la subasta sería atribuir al
     todo lo que solo se sabe de una parte. */
  const lote = texto.match(/(?:puja|pujas|pujado).{0,40}?\bel lote (\d+) de esta subasta/i);

  /* Orden deliberado: la cifra manda sobre cualquier frase, y "es secreta" se
     comprueba antes que "ha recibido alguna puja" porque la primera no dice
     nada de si las hay.
     ⚠️ "Sin pujas en esta subasta" es la versión con sesión; NO confundir con
     "No ha pujado o no ha confirmado ninguna puja", que es el bloque «Mis
     pujas» y habla de las TUYAS, no de las de la subasta. */
  const situacion: SituacionPuja | null = conPuja
    ? 'CONOCIDA'
    : /no ha recibido pujas|sin pujas en (?:esta subasta|el lote \d+)/i.test(texto)
      ? 'SIN_PUJAS'
      : /puja m[áa]xima de la subasta es secreta/i.test(texto)
        ? 'SECRETA'
        : /ha recibido alguna puja/i.test(texto)
          ? 'OCULTA'
          : null;

  // Banner de estado que el Portal muestra sobre la ficha.
  const estado =
    texto.match(/LA SUBASTA HA[^.]*?\./i)?.[0] ??
    texto.match(/La subasta no ha recibido pujas\./i)?.[0] ??
    null;

  return {
    pujaMaximaTexto: conPuja
      ? conPuja[1]! + ' €'
      : situacion === 'SIN_PUJAS'
        ? 'La subasta no ha recibido pujas.'
        : situacion === 'OCULTA'
          ? 'La subasta ha recibido alguna puja; el Portal reserva el importe.'
          : situacion === 'SECRETA'
            ? 'La puja máxima de la subasta es secreta.'
            : null,
    pujaMaxima: conPuja ? parseImporteES(conPuja[1]!) : null,
    situacionPuja: situacion,
    lote: lote ? Number(lote[1]) : null,
    estadoTexto: estado ? limpiar(estado) : null,
  };
}
