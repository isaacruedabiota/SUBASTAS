import type { FichaPortal } from '@subastas/core';
import { abrirBd } from './index';
import { guardarAdjuntos } from './adjuntos';

/**
 * Persistencia de la ficha del Portal.
 *
 * Cada "Bien N" del Portal se guarda como un lote con su inmueble: el modelo de
 * 001 separa lote (lo que se subasta) de inmueble (el bien), y encaja bien
 * aunque el Portal diga "Sin lotes" — eso significa un único bien, no ninguno.
 */

export function guardarFichaPortal(ficha: FichaPortal): void {
  const db = abrirBd();
  const ahora = new Date().toISOString();

  db.prepare(
    `INSERT INTO subastas (
       identificador, tipo, estado, fecha_inicio, fecha_conclusion,
       autoridad_gestora, expediente, nig,
       valor_subasta, tasacion, puja_minima, importe_deposito,
       tramos_entre_pujas, cantidad_reclamada,
       id_anuncio_boe, url_portal, ingerido_en, actualizado_en,
       estado_texto, autoridad_codigo, autoridad_direccion,
       autoridad_telefono, autoridad_correo, portal_leido_en,
       lectura, numero_lotes, puja_minima_situacion
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(identificador) DO UPDATE SET
       tipo                = excluded.tipo,
       estado              = excluded.estado,
       fecha_inicio        = excluded.fecha_inicio,
       fecha_conclusion    = excluded.fecha_conclusion,
       expediente          = excluded.expediente,
       valor_subasta       = excluded.valor_subasta,
       tasacion            = excluded.tasacion,
       puja_minima         = excluded.puja_minima,
       importe_deposito    = excluded.importe_deposito,
       tramos_entre_pujas  = excluded.tramos_entre_pujas,
       cantidad_reclamada  = excluded.cantidad_reclamada,
       id_anuncio_boe      = excluded.id_anuncio_boe,
       actualizado_en      = excluded.actualizado_en,
       estado_texto        = excluded.estado_texto,
       portal_leido_en     = excluded.portal_leido_en,
       numero_lotes        = excluded.numero_lotes,
       puja_minima_situacion = excluded.puja_minima_situacion,
       /* Una lectura básica no baja el nivel: si ya estaba completa, sigue. */
       lectura = CASE WHEN subastas.lectura = 'COMPLETA' THEN 'COMPLETA'
                      ELSE excluded.lectura END,
       /* La autoridad solo la trae la lectura completa. COALESCE para que una
          básica posterior no borre lo que ya se sabía: null aquí significa "no
          se ha mirado esa pestaña", no "no consta". */
       autoridad_gestora   = COALESCE(excluded.autoridad_gestora, subastas.autoridad_gestora),
       autoridad_codigo    = COALESCE(excluded.autoridad_codigo, subastas.autoridad_codigo),
       autoridad_direccion = COALESCE(excluded.autoridad_direccion, subastas.autoridad_direccion),
       autoridad_telefono  = COALESCE(excluded.autoridad_telefono, subastas.autoridad_telefono),
       autoridad_correo    = COALESCE(excluded.autoridad_correo, subastas.autoridad_correo)`,
  ).run(
    ficha.identificador,
    ficha.tipoSubasta,
    estadoNormalizado(ficha),
    ficha.fechaInicio,
    ficha.fechaConclusion,
    ficha.autoridad?.descripcion ?? null,
    ficha.cuentaExpediente,
    null, // el NIG viene del anuncio del BOE, no de la ficha
    agregado(ficha, 'valorSubasta'),
    agregado(ficha, 'tasacion'),
    ficha.pujaMinima,
    agregado(ficha, 'importeDeposito'),
    ficha.tramosEntrePujas,
    ficha.cantidadReclamada,
    ficha.anuncioBoe,
    `https://subastas.boe.es/ds.php?id=${ficha.identificador}`,
    ahora,
    ahora,
    ficha.estadoTexto,
    ficha.autoridad?.codigo ?? null,
    ficha.autoridad?.direccion ?? null,
    ficha.autoridad?.telefono ?? null,
    ficha.autoridad?.correo ?? null,
    ficha.capturadoEn,
    ficha.nivelLectura,
    ficha.numeroLotes,
    ficha.situacionPujaMinima,
  );

  // Los bienes se reescriben enteros: es más simple y seguro que reconciliar,
  // y ON DELETE CASCADE se encarga de los inmuebles.
  db.prepare('DELETE FROM lotes WHERE subasta_id = ?').run(ficha.identificador);

  const insLote = db.prepare(
    `INSERT INTO lotes (subasta_id, numero, tipo_bien, valor_subasta, tasacion,
                        puja_minima, puja_minima_situacion, descripcion)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const insInmueble = db.prepare(
    `INSERT INTO inmuebles (
       lote_id, direccion, municipio, provincia, codigo_postal,
       referencia_catastral, cru, descripcion, situacion_posesoria, visitable,
       cargas, localidad, cargas_importe, vivienda_habitual,
       inscripcion_registral, titulo_juridico, informacion_adicional
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  // Un lote de BD por lote del Portal, con SUS importes: en las subastas con
  // adjudicación separada cada lote tiene precio propio y la ficha general no
  // los publica.
  for (const lote of ficha.lotes) {
    const primero = lote.bienes[0];

    const res = insLote.run(
      ficha.identificador,
      lote.numero,
      tipoBienNormalizado(primero?.tipo ?? null),
      lote.valorSubasta,
      lote.tasacion,
      lote.pujaMinima,
      lote.situacionPujaMinima,
      primero?.descripcion ?? null,
    );
    const loteId = Number(res.lastInsertRowid);

    for (const bien of lote.bienes) {
      insInmueble.run(
        loteId,
        bien.direccion,
        bien.localidad,
        bien.provincia,
        bien.codigoPostal,
        bien.referenciaCatastral,
        bien.idufir,
        bien.descripcion,
        bien.situacionPosesoria,
        bien.visitable === null ? null : /^s[íi]$/i.test(bien.visitable) ? 1 : 0,
        bien.cargas,
        bien.localidad,
        bien.cargasImporte,
        bien.viviendaHabitual === null ? null : bien.viviendaHabitual ? 1 : 0,
        bien.inscripcionRegistral,
        bien.tituloJuridico,
        bien.informacionAdicional,
      );
    }
  }

  // Fotos y documentos: los metadatos venían en el HTML que ya se leyó.
  guardarAdjuntos(ficha.identificador, ficha.adjuntos);

  /* Serie temporal de pujas: se añade, nunca se sobrescribe.
     La condición es la SITUACIÓN, no el importe: en curso el Portal declara si
     hay pujas pero reserva la cifra, y esa declaración es justo lo que hay que
     guardar para no leer "sin importe" como "sin pujas". */
  if (ficha.situacionPuja !== null || ficha.pujaMaxima !== null) {
    db.prepare(
      `INSERT INTO estado_puja (subasta_id, puja_maxima, numero_pujas,
                                numero_pujantes, situacion, capturado_en)
       VALUES (?,?,?,?,?,?)`,
    ).run(
      ficha.identificador,
      ficha.pujaMaxima,
      null,
      null,
      ficha.situacionPuja,
      ficha.capturadoEn,
    );
  }

  // Índice de búsqueda de texto.
  db.prepare('DELETE FROM busqueda WHERE subasta_id = ?').run(ficha.identificador);
  const insBusqueda = db.prepare('INSERT INTO busqueda VALUES (?,?,?,?,?)');
  for (const bien of ficha.lotes.flatMap((l) => l.bienes)) {
    insBusqueda.run(
      ficha.identificador,
      bien.direccion ?? '',
      bien.localidad ?? '',
      bien.provincia ?? '',
      bien.descripcion ?? '',
    );
  }
}

/**
 * Importe a nivel de subasta. Con adjudicación separada la ficha general no lo
 * publica, así que se suma el de los lotes: es lo que costaría llevarse todo.
 */
function agregado(
  ficha: FichaPortal,
  campo: 'valorSubasta' | 'tasacion' | 'importeDeposito',
): number | null {
  if (ficha.numeroLotes === 0) return ficha[campo];

  const valores = ficha.lotes
    .map((l) => l[campo])
    .filter((v): v is number => v !== null);

  return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) : null;
}

/** El Portal no da un código de estado, solo un banner de texto. */
function estadoNormalizado(ficha: FichaPortal): string {
  const t = ficha.estadoTexto ?? '';
  if (/HA CONCLUIDO|FINALIZAD/i.test(t)) return 'CONCLUIDA';
  if (/SUSPENDID/i.test(t)) return 'SUSPENDIDA';
  if (/CANCELAD/i.test(t)) return 'CANCELADA';

  const ahora = Date.now();
  if (ficha.fechaConclusion && Date.parse(ficha.fechaConclusion) < ahora) return 'CONCLUIDA';
  if (ficha.fechaInicio && Date.parse(ficha.fechaInicio) > ahora) return 'PROXIMA_APERTURA';

  /**
   * Sin fechas no se puede afirmar que esté en curso. El Portal publica la
   * ficha en cuanto se anuncia, antes de fijar el calendario, y darla por
   * "en curso" mostraba como abiertas subastas que aún no habían empezado.
   */
  if (!ficha.fechaInicio && !ficha.fechaConclusion) return 'PROXIMA_APERTURA';

  return 'CELEBRANDOSE';
}

function tipoBienNormalizado(tipo: string | null): string {
  if (!tipo) return 'OTRO';
  if (/inmueble/i.test(tipo)) return 'INMUEBLE';
  if (/veh[íi]culo/i.test(tipo)) return 'VEHICULO';
  if (/mueble/i.test(tipo)) return 'MUEBLE';
  return 'OTRO';
}

/**
 * Añade una captura del estado de la puja. Serie temporal: nunca sobrescribe.
 *
 * Se usa al refrescar solo la pestaña de pujas de una subasta viva, que es una
 * petición en vez de las cuatro de la ficha entera.
 */
export function registrarPuja(
  subastaId: string,
  captura: {
    pujaMaxima: number | null;
    situacionPuja: FichaPortal['situacionPuja'];
    /** null = la subasta no separa lotes. Con lotes, la cifra es DE ESE lote. */
    lote?: number | null;
    capturadoEn: string;
  },
): void {
  abrirBd()
    .prepare(
      `INSERT INTO estado_puja (subasta_id, puja_maxima, numero_pujas,
                                numero_pujantes, situacion, lote, capturado_en)
       VALUES (?,?,NULL,NULL,?,?,?)`,
    )
    .run(
      subastaId,
      captura.pujaMaxima,
      captura.situacionPuja,
      captura.lote ?? null,
      captura.capturadoEn,
    );
}

/** Última captura de un lote (o de la subasta), para no repetir lecturas. */
export function ultimaCapturaPuja(
  subastaId: string,
  lote: number | null = null,
): { pujaMaxima: number | null; situacion: string | null; capturadoEn: string } | null {
  const f = abrirBd()
    .prepare(
      `SELECT puja_maxima AS pujaMaxima, situacion, capturado_en AS capturadoEn
         FROM estado_puja
        WHERE subasta_id = ? AND lote IS ?
        ORDER BY capturado_en DESC, id DESC LIMIT 1`,
    )
    .get(subastaId, lote) as
    | { pujaMaxima: number | null; situacion: string | null; capturadoEn: string }
    | undefined;
  return f ?? null;
}

export function contarSubastas(): number {
  const f = abrirBd().prepare('SELECT COUNT(*) AS n FROM subastas').get() as { n: number };
  return f.n;
}
