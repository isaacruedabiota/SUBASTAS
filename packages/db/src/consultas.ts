import type { SituacionPuja } from '@subastas/core';
import { abrirBd } from './index';

/**
 * Consultas de lectura para la web y el móvil.
 *
 * El catálogo sale de `anuncio_subastas` (identificadores conocidos por el BOE,
 * que es la vía oficial). Los datos ricos salen de `subastas`/`inmuebles`, que
 * solo existen para las fichas ya leídas del Portal. Por eso casi todo es LEFT
 * JOIN: una subasta del catálogo sin ficha leída es lo normal, no un error.
 */

export interface FilaCatalogo {
  subastaId: string;
  anuncioId: string;
  /** Título del edicto del BOE. En las judiciales es el partido judicial. */
  tituloBoe: string | null;
  tieneFicha: boolean;

  tipo: string | null;
  estado: string | null;
  tasacion: number | null;
  valorSubasta: number | null;
  fechaConclusion: string | null;

  /* Lo que hace falta para saber cuánto habría que poner sobre la mesa. El
     valor de salida NO es un suelo: es la referencia. El suelo, si existe, es
     la puja mínima; y si ya hay pujas, lo que manda es la última. */
  pujaMinima: number | null;
  pujaMinimaSituacion: 'IMPORTE' | 'SIN_MINIMA' | 'POR_LOTE' | null;
  importeDeposito: number | null;
  tramosEntrePujas: number | null;
  pujaMaxima: number | null;
  situacionPuja: SituacionPuja | null;

  direccion: string | null;
  localidad: string | null;
  provincia: string | null;

  superficieConstruida: number | null;
  superficieSuelo: number | null;
  anioConstruccion: number | null;
  usoPrincipal: string | null;
  lat: number | null;
  lon: number | null;
  /** Fotos del inmueble publicadas por el Portal. Las trae ~1 de cada 20. */
  numeroFotos: number;
  /**
   * Ficheros de las fotos ya descargadas del Portal, en orden. El listado las
   * pasa por un carrusel, así que hacen falta todas, no solo la primera.
   */
  fotos: string[];
}

export interface FiltrosCatalogo {
  texto?: string;
  provincia?: string;
  /** Población. Se compara sin tildes ni mayúsculas: ver `sin_tildes`. */
  localidad?: string;
  tipo?: string;
  estado?: string;
  soloConFicha?: boolean;
  /** Importes en céntimos, superficies en m². */
  precioMin?: number;
  precioMax?: number;
  superficieMin?: number;
  superficieMax?: number;
  anioMin?: number;
  /** Porcentaje mínimo por debajo de la tasación. */
  descuentoMin?: number;
  /**
   * Solo las que el Portal informa expresamente sin cargas. Es restrictivo a
   * propósito: `cargas IS NULL` significa "no informado", nunca "libre".
   */
  sinCargas?: boolean;
  /** Solo geolocalizadas: para el mapa. */
  conCoordenadas?: boolean;
  /** Solo las que el Portal publica con fotografías del inmueble. */
  conFotos?: boolean;
  orden?: 'fecha' | 'precio' | 'descuento' | 'superficie';
  limite?: number;
  offset?: number;
}

/**
 * Estado de puja de cada subasta: la última captura **de cada lote**, agregada.
 *
 * `estado_puja` es una serie temporal (se añade, nunca se sobrescribe) y con
 * `lote` por fila, porque el Portal puja los lotes por separado y da una cifra
 * por lote, no de la subasta. Aquí se hacen dos cosas:
 *
 * 1. Quedarse con la lectura más reciente de cada lote (`COALESCE(lote, 0)`
 *    agrupa las subastas sin lotes, donde `lote` es NULL).
 * 2. Sumar. Es el mismo criterio que ya se usa con los importes (`agregado()`):
 *    lo que costaría llevárselo todo. `lotesConImporte` frente a `lotes` dice
 *    si esa suma está completa o solo cubre parte.
 *
 * La situación combinada se queda con la más informativa: basta que un lote
 * tenga pujas para que la subasta las tenga.
 */
const ULTIMA_PUJA = `
  SELECT subasta_id,
         SUM(puja_maxima)                     AS puja_maxima,
         CASE
           WHEN SUM(situacion = 'CONOCIDA')  > 0 THEN 'CONOCIDA'
           WHEN SUM(situacion = 'OCULTA')    > 0 THEN 'OCULTA'
           WHEN SUM(situacion = 'SECRETA')   > 0 THEN 'SECRETA'
           WHEN SUM(situacion = 'SIN_PUJAS') > 0 THEN 'SIN_PUJAS'
         END                                  AS situacion,
         MAX(capturado_en)                    AS capturado_en,
         COUNT(*)                             AS lotes,
         COALESCE(SUM(situacion = 'CONOCIDA'), 0) AS lotes_con_importe
    FROM (
      SELECT subasta_id, puja_maxima, situacion, capturado_en,
             ROW_NUMBER() OVER (PARTITION BY subasta_id, COALESCE(lote, 0)
                                ORDER BY capturado_en DESC, id DESC) AS r
        FROM estado_puja e
       WHERE e.lote IS NOT NULL
          /* Las lecturas sin lote solo valen si la subasta no tiene ninguna con
             lote: si la tiene, aquella era una cifra "de la subasta" que el
             Portal no da cuando hay lotes, y sumarla duplicaría. */
          OR NOT EXISTS (
               SELECT 1 FROM estado_puja x
                WHERE x.subasta_id = e.subasta_id AND x.lote IS NOT NULL
             )
    )
   WHERE r = 1
   GROUP BY subasta_id
`;

/**
 * El catálogo son TODOS los identificadores conocidos, vengan del BOE o de una
 * ficha ya leída del Portal.
 *
 * Partir solo de `anuncio_subastas` tenía dos fallos: una subasta cuya ficha se
 * hubiera leído a mano desaparecía si su anuncio aún no estaba ingerido, y una
 * subasta citada en varios anuncios salía duplicada en el listado. El GROUP BY
 * y la UNION resuelven ambos.
 */
const BASE_CATALOGO = `
  FROM (
    SELECT subasta_id, MIN(anuncio_id) AS anuncio_id
      FROM anuncio_subastas
     GROUP BY subasta_id
    UNION
    SELECT identificador AS subasta_id, NULL AS anuncio_id
      FROM subastas
     WHERE identificador NOT IN (SELECT subasta_id FROM anuncio_subastas)
  ) a
  LEFT JOIN anuncios_boe b ON b.identificador = a.anuncio_id
  LEFT JOIN subastas s  ON s.identificador = a.subasta_id
  LEFT JOIN lotes l     ON l.subasta_id = s.identificador AND l.numero = 1
  -- Un lote puede tener VARIOS bienes; sin acotar a uno, el JOIN multiplicaba
  -- las filas y la misma subasta salía repetida en el listado.
  LEFT JOIN inmuebles i ON i.id = (
    SELECT MIN(id) FROM inmuebles WHERE lote_id = l.id
  )
  LEFT JOIN catastro c  ON c.referencia_catastral = i.referencia_catastral
  -- Coordenadas deducidas de la dirección para las que Catastro no sitúa.
  LEFT JOIN geocodificacion g ON g.inmueble_id = i.id AND g.lat IS NOT NULL
  -- Estado de la puja, ya agregado por subasta: una fila, no multiplica.
  LEFT JOIN (${ULTIMA_PUJA}) up ON up.subasta_id = a.subasta_id
`;

/** Las de Catastro mandan; las geocodificadas son el plan B. */
const LAT = 'COALESCE(c.lat, g.lat)';
const LON = 'COALESCE(c.lon, g.lon)';

function construirWhere(f: FiltrosCatalogo): { sql: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (f.texto?.trim()) {
    // Se busca tanto en los bienes ya leídos como en el título del edicto.
    condiciones.push(`(
      a.subasta_id IN (SELECT subasta_id FROM busqueda WHERE busqueda MATCH ?)
      OR COALESCE(b.titulo, '') LIKE ?
    )`);
    params.push(f.texto.trim(), `%${f.texto.trim()}%`);
  }
  if (f.provincia) {
    condiciones.push('i.provincia = ?');
    params.push(f.provincia);
  }
  if (f.localidad?.trim()) {
    /* Sin normalizar no vale: el Portal escribe la misma población de varias
       formas (MALAGA / MÁLAGA / Málaga son tres filas distintas), así que una
       comparación literal devuelve solo un trozo de lo que hay. */
    condiciones.push('sin_tildes(i.localidad) = sin_tildes(?)');
    params.push(f.localidad.trim());
  }
  if (f.tipo) {
    condiciones.push('s.tipo = ?');
    params.push(f.tipo);
  }
  if (f.estado) {
    condiciones.push('s.estado = ?');
    params.push(f.estado);
  }
  if (f.soloConFicha) {
    condiciones.push('s.identificador IS NOT NULL');
  }

  if (f.precioMin !== undefined) {
    condiciones.push('s.valor_subasta >= ?');
    params.push(f.precioMin);
  }
  if (f.precioMax !== undefined) {
    condiciones.push('s.valor_subasta <= ?');
    params.push(f.precioMax);
  }

  // La superficie útil es la construida salvo en rústicas, donde vale 0 y la
  // que importa es la del suelo. COALESCE con NULLIF resuelve ambos casos.
  if (f.superficieMin !== undefined) {
    condiciones.push(
      'COALESCE(NULLIF(c.superficie_construida, 0), c.superficie_suelo) >= ?',
    );
    params.push(f.superficieMin);
  }
  if (f.superficieMax !== undefined) {
    condiciones.push(
      'COALESCE(NULLIF(c.superficie_construida, 0), c.superficie_suelo) <= ?',
    );
    params.push(f.superficieMax);
  }

  if (f.anioMin !== undefined) {
    condiciones.push('c.anio_construccion >= ?');
    params.push(f.anioMin);
  }

  if (f.descuentoMin !== undefined) {
    condiciones.push(
      '(s.tasacion > 0 AND (1.0 - CAST(s.valor_subasta AS REAL) / s.tasacion) * 100 >= ?)',
    );
    params.push(f.descuentoMin);
  }

  if (f.sinCargas) {
    // Solo lo informado expresamente como libre: NULL es "no consta".
    condiciones.push("(i.cargas IS NOT NULL AND COALESCE(i.cargas_importe, 0) = 0)");
  }

  if (f.conCoordenadas) {
    condiciones.push(`${LAT} IS NOT NULL AND ${LON} IS NOT NULL`);
  }

  if (f.conFotos) {
    condiciones.push(
      `EXISTS (SELECT 1 FROM adjunto_subasta ad
                WHERE ad.subasta_id = a.subasta_id AND ad.tipo = 'FOTO')`,
    );
  }

  return {
    sql: condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

/**
 * Prioridad de estado para el orden por defecto del catálogo.
 *
 * Lo primero que se quiere ver es lo que todavía se puede pujar; una subasta
 * concluida hace meses no debe encabezar el listado por muy próxima que sea su
 * fecha. Dentro de cada grupo manda la fecha de conclusión.
 */
const PRIORIDAD_ESTADO = `CASE
    WHEN s.estado = 'CELEBRANDOSE'     THEN 0
    WHEN s.estado = 'PROXIMA_APERTURA' THEN 1
    /* Sin ficha leída no sabemos el estado, pero una subasta dura ~20 días
       desde que se anuncia: lo recién publicado suele seguir vivo y no debe
       caer por debajo de cientos de subastas ya concluidas. */
    WHEN s.estado IS NULL              THEN 2
    WHEN s.estado = 'SUSPENDIDA'       THEN 3
    WHEN s.estado = 'CONCLUIDA'        THEN 4
    ELSE 5
  END`;

const ORDENES: Record<string, string> = {
  /* Dentro de cada grupo: las que tienen calendario, por conclusión más
     próxima; las que no (sin ficha), por anuncio del BOE más reciente. */
  fecha: `${PRIORIDAD_ESTADO}, s.fecha_conclusion IS NULL, s.fecha_conclusion ASC, b.fecha_publicacion DESC`,
  precio: 's.valor_subasta IS NULL, s.valor_subasta ASC',
  superficie:
    'COALESCE(NULLIF(c.superficie_construida, 0), c.superficie_suelo) IS NULL, COALESCE(NULLIF(c.superficie_construida, 0), c.superficie_suelo) DESC',
  descuento:
    's.tasacion IS NULL, (1.0 - CAST(s.valor_subasta AS REAL) / NULLIF(s.tasacion, 0)) DESC',
};

export function listarCatalogo(filtros: FiltrosCatalogo = {}): FilaCatalogo[] {
  const { sql: where, params } = construirWhere(filtros);
  const limite = Math.min(filtros.limite ?? 50, 200);
  const offset = filtros.offset ?? 0;

  const filas = abrirBd()
    .prepare(
      `SELECT
         a.subasta_id            AS subastaId,
         a.anuncio_id            AS anuncioId,
         b.titulo                AS tituloBoe,
         s.identificador IS NOT NULL AS tieneFicha,
         s.tipo, s.estado, s.tasacion,
         s.valor_subasta         AS valorSubasta,
         s.fecha_conclusion      AS fechaConclusion,
         s.puja_minima           AS pujaMinima,
         s.puja_minima_situacion AS pujaMinimaSituacion,
         s.importe_deposito      AS importeDeposito,
         s.tramos_entre_pujas    AS tramosEntrePujas,
         up.puja_maxima          AS pujaMaxima,
         up.situacion            AS situacionPuja,
         i.direccion, i.localidad, i.provincia,
         c.superficie_construida AS superficieConstruida,
         c.superficie_suelo      AS superficieSuelo,
         c.anio_construccion     AS anioConstruccion,
         c.uso_principal         AS usoPrincipal,
         ${LAT} AS lat, ${LON} AS lon,
         (SELECT COUNT(*) FROM adjunto_subasta ad
           WHERE ad.subasta_id = a.subasta_id AND ad.tipo = 'FOTO') AS numeroFotos,
         /* group_concat no respeta el orden por sí solo: hay que ordenar en una
            subconsulta interna. Se topan en 6 para no cargar el listado. */
         (SELECT group_concat(ruta, '|') FROM (
            SELECT ruta FROM adjunto_subasta
             WHERE subasta_id = a.subasta_id AND tipo = 'FOTO' AND ruta IS NOT NULL
             ORDER BY orden LIMIT 6
          )) AS fotosCrudas
       ${BASE_CATALOGO}
       ${where}
       ORDER BY ${ORDENES[filtros.orden ?? 'fecha'] ?? ORDENES.fecha}, a.subasta_id
       LIMIT ? OFFSET ?`,
    )
    .all(...(params as never[]), limite, offset) as Array<
    Record<string, unknown>
  >;

  /* Objeto literal, no spread de la fila: `node:sqlite` las devuelve con
     prototipo nulo y estas cruzan a un Client Component (el carrusel). */
  return filas.map((f) => ({
    ...(f as unknown as FilaCatalogo),
    tieneFicha: Boolean(f.tieneFicha),
    fotos: f.fotosCrudas ? String(f.fotosCrudas).split('|').filter(Boolean) : [],
  })) as FilaCatalogo[];
}

export interface PuntoMapa {
  subastaId: string;
  lat: number;
  lon: number;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  valorSubasta: number | null;
  tasacion: number | null;
  superficie: number | null;
  estado: string | null;
}

/**
 * Subastas geolocalizadas. Solo salen las que Catastro pudo situar.
 *
 * Se reconstruyen como objetos literales: `node:sqlite` devuelve filas con
 * prototipo nulo y React rechaza pasarlas a un Client Component
 * ("Only plain objects… can be passed to Client Components").
 */
export function puntosMapa(filtros: FiltrosCatalogo = {}): PuntoMapa[] {
  const { sql: where, params } = construirWhere({ ...filtros, conCoordenadas: true });

  const filas = abrirBd()
    .prepare(
      `SELECT a.subasta_id AS subastaId, ${LAT} AS lat, ${LON} AS lon,
              i.direccion, i.localidad, i.provincia,
              s.valor_subasta AS valorSubasta, s.tasacion, s.estado,
              COALESCE(NULLIF(c.superficie_construida, 0), c.superficie_suelo) AS superficie
       ${BASE_CATALOGO}
       ${where}
       LIMIT 2000`,
    )
    .all(...(params as never[])) as Array<Record<string, unknown>>;

  return filas.map((f) => ({
    subastaId: f.subastaId as string,
    lat: f.lat as number,
    lon: f.lon as number,
    direccion: (f.direccion as string | null) ?? null,
    localidad: (f.localidad as string | null) ?? null,
    provincia: (f.provincia as string | null) ?? null,
    valorSubasta: (f.valorSubasta as number | null) ?? null,
    tasacion: (f.tasacion as number | null) ?? null,
    superficie: (f.superficie as number | null) ?? null,
    estado: (f.estado as string | null) ?? null,
  }));
}

/** Extremos reales de la base, para acotar los campos de filtro. */
export function rangos(): {
  precioMin: number;
  precioMax: number;
  superficieMax: number;
  anioMin: number;
  tipos: string[];
} {
  const db = abrirBd();

  const p = db
    .prepare(
      `SELECT MIN(valor_subasta) AS mn, MAX(valor_subasta) AS mx
       FROM subastas WHERE valor_subasta IS NOT NULL AND valor_subasta > 0`,
    )
    .get() as { mn: number | null; mx: number | null };

  const s = db
    .prepare(
      `SELECT MAX(COALESCE(NULLIF(superficie_construida, 0), superficie_suelo)) AS mx,
              MIN(anio_construccion) AS anio
       FROM catastro WHERE error IS NULL`,
    )
    .get() as { mx: number | null; anio: number | null };

  const tipos = (
    db
      .prepare('SELECT DISTINCT tipo FROM subastas WHERE tipo IS NOT NULL ORDER BY tipo')
      .all() as Array<{ tipo: string }>
  ).map((t) => t.tipo);

  return {
    precioMin: p.mn ?? 0,
    precioMax: p.mx ?? 0,
    superficieMax: s.mx ?? 0,
    anioMin: s.anio ?? 1900,
    tipos,
  };
}

/**
 * Poblaciones conocidas, para el desplegable del filtro.
 *
 * Se agrupan **normalizadas**: `MALAGA`, `MÁLAGA` y `Málaga` son la misma y
 * deben salir una sola vez, o el usuario elige una variante y se pierde el
 * resto. Como etiqueta se enseña la forma más frecuente, que suele ser la mejor
 * escrita; el filtro compara la normalizada, así que da igual cuál se elija.
 */
export function localidades(
  provincia?: string,
): Array<{ localidad: string; n: number }> {
  const filas = abrirBd()
    .prepare(
      `SELECT localidad, total AS n FROM (
         SELECT i.localidad AS localidad,
                ROW_NUMBER() OVER (PARTITION BY sin_tildes(i.localidad)
                                   ORDER BY COUNT(*) DESC, i.localidad) AS r,
                /* El total de la población, no el de esta forma de escribirla:
                   si no, junto a "MALAGA" saldría 4 habiendo 11. */
                SUM(COUNT(*)) OVER (PARTITION BY sin_tildes(i.localidad)) AS total
           FROM inmuebles i
          WHERE i.localidad IS NOT NULL AND TRIM(i.localidad) <> ''
            AND (? IS NULL OR i.provincia = ?)
          GROUP BY i.localidad
       )
       WHERE r = 1
       ORDER BY localidad`,
    )
    .all(provincia ?? null, provincia ?? null) as Array<{
    localidad: string;
    n: number;
  }>;

  return filas.map((f) => ({ localidad: f.localidad, n: f.n }));
}

export function contarCatalogo(filtros: FiltrosCatalogo = {}): number {
  const { sql: where, params } = construirWhere(filtros);
  const fila = abrirBd()
    .prepare(`SELECT COUNT(*) AS n ${BASE_CATALOGO} ${where}`)
    .get(...(params as never[])) as { n: number };
  return fila.n;
}

// ---------------------------------------------------------------------------

export interface BienDetalle {
  /** Id del inmueble. Es lo único único por bien: un lote puede tener varios. */
  bienId: number | null;
  /** Nº de lote del Portal. NO identifica al bien: 24 bienes pueden ser el lote 1. */
  lote: number;
  tipoBien: string;
  descripcion: string | null;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  referenciaCatastral: string | null;
  cru: string | null;
  situacionPosesoria: string | null;
  cargas: string | null;
  cargasImporte: number | null;
  viviendaHabitual: number | null;
  inscripcionRegistral: string | null;
  tituloJuridico: string | null;
  informacionAdicional: string | null;
  catastro: {
    clase: string | null;
    superficieConstruida: number | null;
    superficieSuelo: number | null;
    anioConstruccion: number | null;
    usoPrincipal: string | null;
    tipoFinca: string | null;
    direccionCompleta: string | null;
    urlPlano: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
  /**
   * Punto del inmueble. Va aquí y no dentro de `catastro` porque puede venir de
   * la dirección geocodificada, en cuyo caso no hay ficha catastral ninguna.
   */
  lat: number | null;
  lon: number | null;
  /** CATASTRO (centroide de parcela) | DIRECCION (deducido del texto) */
  origenPunto: 'CATASTRO' | 'DIRECCION' | null;
  precisionPunto: string | null;
  /** Foto de calle descargada de Mapillary, si la hay. Street View va en vivo. */
  fotoCalle: {
    ruta: string;
    /** Id en Mapillary: permite empotrar su visor navegable, que es gratis. */
    imagenId: string | null;
    autor: string | null;
    licencia: string | null;
    distanciaM: number | null;
    capturadaEn: string | null;
  } | null;
}

export interface SubastaDetalle {
  identificador: string;
  tipo: string | null;
  estado: string | null;
  estadoTexto: string | null;
  fechaInicio: string | null;
  fechaConclusion: string | null;
  autoridadGestora: string | null;
  autoridadTelefono: string | null;
  autoridadCorreo: string | null;
  expediente: string | null;
  tasacion: number | null;
  valorSubasta: number | null;
  pujaMinima: number | null;
  /**
   * `SIN_MINIMA` es una afirmación del Portal («no hay suelo»), no un hueco.
   * Son 983 de 1.630 fichas: mostrarlas como «No consta» decía lo contrario.
   */
  pujaMinimaSituacion: 'IMPORTE' | 'SIN_MINIMA' | 'POR_LOTE' | null;
  importeDeposito: number | null;
  tramosEntrePujas: number | null;
  cantidadReclamada: number | null;
  idAnuncioBoe: string | null;
  urlPortal: string | null;
  portalLeidoEn: string | null;
  /**
   * `BASICA` = solo datos y bienes; falta autoridad gestora y pujas. La ficha
   * completa el resto al abrirse. Sin esto, "la autoridad no consta" y "aún no
   * se ha mirado" serían indistinguibles.
   */
  lectura: 'BASICA' | 'COMPLETA' | null;
  /** Lotes que DECLARA el Portal, que puede no ser el de lotes ya leídos. */
  numeroLotes: number | null;
  bienes: BienDetalle[];
  /** Última lectura de cada lote. Con lote único, una sola fila con `lote: null`. */
  pujas: Array<{
    pujaMaxima: number | null;
    /** Ver `SituacionPuja`: sin ella, "sin importe" se confunde con "sin pujas". */
    situacion: SituacionPuja | null;
    /** null = la subasta no separa lotes. Con lotes, la cifra es DE ese lote. */
    lote: number | null;
    capturadoEn: string;
  }>;
  /** Fotos y documentos que el Portal publica en la pestaña de bienes. */
  adjuntos: Array<{
    docId: string;
    tipo: string;
    titulo: string;
    ruta: string | null;
  }>;
}

export function obtenerSubasta(identificador: string): SubastaDetalle | null {
  const db = abrirBd();

  const s = db
    .prepare(
      `SELECT identificador, tipo, estado,
              estado_texto        AS estadoTexto,
              fecha_inicio        AS fechaInicio,
              fecha_conclusion    AS fechaConclusion,
              autoridad_gestora   AS autoridadGestora,
              autoridad_telefono  AS autoridadTelefono,
              autoridad_correo    AS autoridadCorreo,
              expediente, tasacion,
              valor_subasta       AS valorSubasta,
              puja_minima         AS pujaMinima,
              puja_minima_situacion AS pujaMinimaSituacion,
              importe_deposito    AS importeDeposito,
              tramos_entre_pujas  AS tramosEntrePujas,
              cantidad_reclamada  AS cantidadReclamada,
              id_anuncio_boe      AS idAnuncioBoe,
              url_portal          AS urlPortal,
              portal_leido_en     AS portalLeidoEn,
              lectura,
              numero_lotes        AS numeroLotes
       FROM subastas WHERE identificador = ?`,
    )
    .get(identificador) as Record<string, unknown> | undefined;

  if (!s) return null;

  const bienes = db
    .prepare(
      `SELECT i.id AS bienId, l.numero AS lote, l.tipo_bien AS tipoBien,
              i.descripcion, i.direccion, i.localidad, i.provincia,
              i.codigo_postal          AS codigoPostal,
              i.referencia_catastral   AS referenciaCatastral,
              i.cru,
              i.situacion_posesoria    AS situacionPosesoria,
              i.cargas,
              i.cargas_importe         AS cargasImporte,
              i.vivienda_habitual      AS viviendaHabitual,
              i.inscripcion_registral  AS inscripcionRegistral,
              i.titulo_juridico        AS tituloJuridico,
              i.informacion_adicional  AS informacionAdicional,
              c.clase,
              c.superficie_construida  AS superficieConstruida,
              c.superficie_suelo       AS superficieSuelo,
              c.anio_construccion      AS anioConstruccion,
              c.uso_principal          AS usoPrincipal,
              c.tipo_finca             AS tipoFinca,
              c.direccion_completa     AS direccionCompleta,
              c.url_plano              AS urlPlano,
              COALESCE(c.lat, g.lat)   AS lat,
              COALESCE(c.lon, g.lon)   AS lon,
              /* De dónde sale el punto: cambia lo que la ficha puede afirmar. */
              CASE WHEN c.lat IS NOT NULL THEN 'CATASTRO'
                   WHEN g.lat IS NOT NULL THEN 'DIRECCION' END AS origenPunto,
              g.precision              AS precisionPunto,
              ic.ruta                  AS fotoRuta,
              ic.imagen_id             AS fotoImagenId,
              ic.autor                 AS fotoAutor,
              ic.licencia              AS fotoLicencia,
              ic.distancia_m           AS fotoDistancia,
              ic.capturada_en          AS fotoCapturadaEn
       FROM lotes l
       LEFT JOIN inmuebles i ON i.lote_id = l.id
       LEFT JOIN catastro c  ON c.referencia_catastral = i.referencia_catastral
       LEFT JOIN geocodificacion g ON g.inmueble_id = i.id AND g.lat IS NOT NULL
       LEFT JOIN imagen_calle ic
              ON ic.referencia_catastral = i.referencia_catastral
             AND ic.ruta IS NOT NULL
       WHERE l.subasta_id = ?
       ORDER BY l.numero, i.id`,
    )
    .all(identificador) as Array<Record<string, unknown>>;

  /* Una fila por lote (la más reciente de cada uno). Con lotes el Portal da una
     cifra por lote, no de la subasta: la ficha las muestra por separado. */
  const pujas = db
    .prepare(
      `SELECT puja_maxima AS pujaMaxima, situacion, lote,
              capturado_en AS capturadoEn
         FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY COALESCE(lote, 0)
                                        ORDER BY capturado_en DESC, id DESC) AS r
             FROM estado_puja e
            WHERE e.subasta_id = ?
              /* Ver ULTIMA_PUJA: con lecturas por lote, la que no lo tiene es
                 una cifra de subasta que el Portal no da, y sobra. */
              AND (e.lote IS NOT NULL
                   OR NOT EXISTS (SELECT 1 FROM estado_puja x
                                   WHERE x.subasta_id = e.subasta_id
                                     AND x.lote IS NOT NULL))
         )
        WHERE r = 1
        ORDER BY lote IS NULL DESC, lote`,
    )
    .all(identificador) as Array<{
    pujaMaxima: number | null;
    situacion: SituacionPuja | null;
    lote: number | null;
    capturadoEn: string;
  }>;

  const adjuntos = db
    .prepare(
      `SELECT doc_id AS docId, tipo, titulo, ruta
         FROM adjunto_subasta
        WHERE subasta_id = ?
        ORDER BY CASE tipo WHEN 'FOTO' THEN 0 ELSE 1 END, orden`,
    )
    .all(identificador) as Array<Record<string, unknown>>;

  return {
    ...(s as unknown as Omit<SubastaDetalle, 'bienes' | 'pujas' | 'adjuntos'>),
    // node:sqlite devuelve filas con prototipo nulo y estas cruzan a un Client
    // Component (la galería): hay que rehacerlas como objeto literal.
    adjuntos: adjuntos.map((a) => ({
      docId: a.docId as string,
      tipo: a.tipo as string,
      titulo: a.titulo as string,
      ruta: (a.ruta as string | null) ?? null,
    })),
    bienes: bienes.map((b) => ({
      bienId: b.bienId as number | null,
      lote: b.lote as number,
      tipoBien: b.tipoBien as string,
      descripcion: b.descripcion as string | null,
      direccion: b.direccion as string | null,
      localidad: b.localidad as string | null,
      provincia: b.provincia as string | null,
      codigoPostal: b.codigoPostal as string | null,
      referenciaCatastral: b.referenciaCatastral as string | null,
      cru: b.cru as string | null,
      situacionPosesoria: b.situacionPosesoria as string | null,
      cargas: b.cargas as string | null,
      cargasImporte: b.cargasImporte as number | null,
      viviendaHabitual: b.viviendaHabitual as number | null,
      inscripcionRegistral: b.inscripcionRegistral as string | null,
      tituloJuridico: b.tituloJuridico as string | null,
      informacionAdicional: b.informacionAdicional as string | null,
      lat: b.lat as number | null,
      lon: b.lon as number | null,
      origenPunto: b.origenPunto as 'CATASTRO' | 'DIRECCION' | null,
      precisionPunto: b.precisionPunto as string | null,
      catastro: b.clase
        ? {
            clase: b.clase as string,
            superficieConstruida: b.superficieConstruida as number | null,
            superficieSuelo: b.superficieSuelo as number | null,
            anioConstruccion: b.anioConstruccion as number | null,
            usoPrincipal: b.usoPrincipal as string | null,
            tipoFinca: b.tipoFinca as string | null,
            direccionCompleta: b.direccionCompleta as string | null,
            urlPlano: b.urlPlano as string | null,
            lat: b.lat as number | null,
            lon: b.lon as number | null,
          }
        : null,
      fotoCalle: b.fotoRuta
        ? {
            ruta: b.fotoRuta as string,
            imagenId: (b.fotoImagenId as string | null) ?? null,
            autor: b.fotoAutor as string | null,
            licencia: b.fotoLicencia as string | null,
            distanciaM: b.fotoDistancia as number | null,
            capturadaEn: b.fotoCapturadaEn as string | null,
          }
        : null,
    })),
    pujas,
  };
}

/** El anuncio del BOE de una subasta que aún no tiene ficha leída. */
export function anuncioDeSubasta(
  subastaId: string,
): { identificador: string; titulo: string; texto: string; urlHtml: string | null } | null {
  const f = abrirBd()
    .prepare(
      `SELECT b.identificador, b.titulo, b.texto, b.url_html AS urlHtml
       FROM anuncio_subastas a
       JOIN anuncios_boe b ON b.identificador = a.anuncio_id
       WHERE a.subasta_id = ? LIMIT 1`,
    )
    .get(subastaId) as
    | { identificador: string; titulo: string; texto: string; urlHtml: string | null }
    | undefined;

  return f ?? null;
}

// ---------------------------------------------------------------------------
// Pujas
// ---------------------------------------------------------------------------

export interface FilaPuja {
  subastaId: string;
  estado: string | null;
  tipo: string | null;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  tasacion: number | null;
  valorSubasta: number | null;
  pujaMinima: number | null;
  /** Solo lo hay si la subasta concluyó: en curso el Portal reserva la cifra. */
  pujaMaxima: number | null;
  situacion: SituacionPuja | null;
  capturadoEn: string;
  fechaConclusion: string | null;
  /** Lotes con lectura de puja. 1 cuando la subasta no los separa. */
  lotes: number;
  /** De esos, cuántos traen importe: dice si `pujaMaxima` es una suma completa. */
  lotesConImporte: number;
}

export interface FiltrosPujas {
  /** `CON_PUJAS` agrupa las que constan con pujas, se sepa el importe o no. */
  situacion?: SituacionPuja | 'CON_PUJAS';
  estado?: string;
  provincia?: string;
  orden?: 'fecha' | 'puja' | 'remate' | 'salida';
  limite?: number;
  offset?: number;
}


/** Remate: cuánto subió la puja sobre el valor de salida. NULL si no aplica. */
const REMATE = `CASE WHEN p.puja_maxima IS NOT NULL AND s.valor_subasta > 0
                     THEN CAST(p.puja_maxima AS REAL) / s.valor_subasta END`;

const ORDENES_PUJAS: Record<string, string> = {
  /* Por defecto lo vivo primero, y dentro lo que antes se resuelve. Una
     concluida en 2024 no debe encabezar el listado. */
  fecha: `${PRIORIDAD_ESTADO}, s.fecha_conclusion IS NULL, s.fecha_conclusion DESC`,
  puja: 'p.puja_maxima IS NULL, p.puja_maxima DESC',
  remate: `${REMATE} IS NULL, ${REMATE} DESC`,
  salida: 's.valor_subasta IS NULL, s.valor_subasta DESC',
};

function wherePujas(f: FiltrosPujas): { sql: string; params: unknown[] } {
  const cond: string[] = [];
  const params: unknown[] = [];

  if (f.situacion === 'CON_PUJAS') {
    // SECRETA queda fuera a propósito: no afirma que las haya.
    cond.push("p.situacion IN ('CONOCIDA', 'OCULTA')");
  } else if (f.situacion) {
    cond.push('p.situacion = ?');
    params.push(f.situacion);
  }
  if (f.estado) {
    cond.push('s.estado = ?');
    params.push(f.estado);
  }
  if (f.provincia) {
    cond.push('i.provincia = ?');
    params.push(f.provincia);
  }

  return {
    sql: cond.length > 0 ? `WHERE ${cond.join(' AND ')}` : '',
    params,
  };
}

const BASE_PUJAS = `
  FROM (${ULTIMA_PUJA}) p
  JOIN subastas s ON s.identificador = p.subasta_id
  LEFT JOIN lotes l     ON l.subasta_id = s.identificador AND l.numero = 1
  LEFT JOIN inmuebles i ON i.id = (SELECT MIN(id) FROM inmuebles WHERE lote_id = l.id)
`;

export function listarPujas(filtros: FiltrosPujas = {}): FilaPuja[] {
  const { sql: where, params } = wherePujas(filtros);
  const limite = Math.min(filtros.limite ?? 100, 500);

  return abrirBd()
    .prepare(
      `SELECT p.subasta_id AS subastaId, s.estado, s.tipo,
              i.direccion, i.localidad, i.provincia,
              s.tasacion,
              s.valor_subasta    AS valorSubasta,
              s.puja_minima      AS pujaMinima,
              p.puja_maxima      AS pujaMaxima,
              p.situacion,
              p.capturado_en     AS capturadoEn,
              s.fecha_conclusion AS fechaConclusion,
              p.lotes,
              p.lotes_con_importe AS lotesConImporte
       ${BASE_PUJAS}
       ${where}
       ORDER BY ${ORDENES_PUJAS[filtros.orden ?? 'fecha'] ?? ORDENES_PUJAS.fecha},
                p.subasta_id
       LIMIT ? OFFSET ?`,
    )
    .all(...(params as never[]), limite, filtros.offset ?? 0) as unknown as FilaPuja[];
}

export function contarPujas(filtros: FiltrosPujas = {}): number {
  const { sql: where, params } = wherePujas(filtros);
  const fila = abrirBd()
    .prepare(`SELECT COUNT(*) AS n ${BASE_PUJAS} ${where}`)
    .get(...(params as never[])) as { n: number };
  return fila.n;
}

export interface ResumenPujas {
  /** Fichas con pestaña de pujas ya leída. */
  fichas: number;
  conImporte: number;
  ocultas: number;
  sinPujas: number;
  /** Concluidas sin haber recibido ninguna puja. */
  desiertas: number;
  /**
   * MEDIANA de puja/salida, no media: hay remates de 500 veces el valor de
   * salida (subastas cuyo valor general es simbólico porque va por lotes) y la
   * media daba 2,5× — un número que no describe a ninguna subasta real.
   */
  remateMediana: number | null;
  /** Mediana de puja/tasación. Es la que dice si se remató barato. */
  sobreTasacionMediana: number | null;
  pujaMaxima: number | null;
}

/** Mediana de una lista ya ordenada de menor a mayor. */
function mediana(ordenados: number[]): number | null {
  if (ordenados.length === 0) return null;
  const m = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[m]!
    : (ordenados[m - 1]! + ordenados[m]!) / 2;
}

export function resumenPujas(): ResumenPujas {
  const db = abrirBd();

  const c = db
    .prepare(
      `SELECT COUNT(*) AS fichas,
              SUM(p.situacion = 'CONOCIDA')  AS conImporte,
              SUM(p.situacion IN ('OCULTA', 'SECRETA')) AS ocultas,
              SUM(p.situacion = 'SIN_PUJAS') AS sinPujas,
              SUM(p.situacion = 'SIN_PUJAS' AND s.estado = 'CONCLUIDA') AS desiertas,
              MAX(p.puja_maxima) AS pujaMaxima
       ${BASE_PUJAS}`,
    )
    .get() as Record<string, number | null>;

  /* Los ratios se traen en bruto (unos cientos de filas) y la mediana se
     calcula aquí: SQLite no tiene percentiles. */
  const ratios = db
    .prepare(
      `SELECT CAST(p.puja_maxima AS REAL) / s.valor_subasta AS remate,
              CAST(p.puja_maxima AS REAL) / s.tasacion      AS sobreTasacion
       ${BASE_PUJAS}
       WHERE p.puja_maxima IS NOT NULL
             AND s.valor_subasta > 0 AND s.tasacion > 0`,
    )
    .all() as Array<{ remate: number; sobreTasacion: number }>;

  const asc = (f: (r: (typeof ratios)[number]) => number) =>
    ratios.map(f).sort((x, y) => x - y);

  return {
    fichas: c.fichas ?? 0,
    conImporte: c.conImporte ?? 0,
    ocultas: c.ocultas ?? 0,
    sinPujas: c.sinPujas ?? 0,
    desiertas: c.desiertas ?? 0,
    remateMediana: mediana(asc((r) => r.remate)),
    sobreTasacionMediana: mediana(asc((r) => r.sobreTasacion)),
    pujaMaxima: c.pujaMaxima ?? null,
  };
}

// ---------------------------------------------------------------------------

export interface Resumen {
  subastasCatalogo: number;
  fichasLeidas: number;
  inmueblesEnriquecidos: number;
  anunciosBoe: number;
  provincias: Array<{ provincia: string; n: number }>;
}

export function resumen(): Resumen {
  const db = abrirBd();
  const uno = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  return {
    subastasCatalogo: uno('SELECT COUNT(DISTINCT subasta_id) AS n FROM anuncio_subastas'),
    fichasLeidas: uno('SELECT COUNT(*) AS n FROM subastas'),
    inmueblesEnriquecidos: uno(
      'SELECT COUNT(*) AS n FROM catastro WHERE error IS NULL',
    ),
    anunciosBoe: uno('SELECT COUNT(*) AS n FROM anuncios_boe'),
    provincias: db
      .prepare(
        `SELECT provincia, COUNT(*) AS n FROM inmuebles
         WHERE provincia IS NOT NULL GROUP BY provincia ORDER BY n DESC`,
      )
      .all() as Array<{ provincia: string; n: number }>,
  };
}
