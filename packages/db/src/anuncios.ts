import { abrirBd } from './index';

export interface AnuncioParaGuardar {
  identificador: string;
  titulo: string;
  departamento: string | null;
  departamentoCodigo: string | null;
  fechaPublicacion: string | null;
  seccion: string | null;
  subseccion: string | null;
  urlPdf: string | null;
  urlHtml: string | null;
  urlXml: string | null;
  texto: string;
  referenciasCatastrales: string[];
  identificadoresSubasta: string[];
}

/**
 * Guarda un anuncio de forma idempotente: reejecutar la ingesta sobre las
 * mismas fechas actualiza en vez de duplicar.
 */
export function guardarAnuncio(anuncio: AnuncioParaGuardar): void {
  const db = abrirBd();

  db.prepare(
    `INSERT INTO anuncios_boe (
       identificador, titulo, departamento, departamento_codigo,
       fecha_publicacion, seccion, subseccion, url_pdf, url_html, url_xml,
       texto, ingerido_en
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(identificador) DO UPDATE SET
       titulo = excluded.titulo,
       texto  = excluded.texto`,
  ).run(
    anuncio.identificador,
    anuncio.titulo,
    anuncio.departamento,
    anuncio.departamentoCodigo,
    anuncio.fechaPublicacion,
    anuncio.seccion,
    anuncio.subseccion,
    anuncio.urlPdf,
    anuncio.urlHtml,
    anuncio.urlXml,
    anuncio.texto,
    new Date().toISOString(),
  );

  const insRef = db.prepare(
    'INSERT OR IGNORE INTO anuncio_referencias VALUES (?,?)',
  );
  for (const ref of anuncio.referenciasCatastrales) {
    insRef.run(anuncio.identificador, ref);
  }

  const insSub = db.prepare('INSERT OR IGNORE INTO anuncio_subastas VALUES (?,?)');
  for (const sub of anuncio.identificadoresSubasta) {
    insSub.run(anuncio.identificador, sub);
  }

  // FTS5 no tiene UPSERT: se borra y se reinserta.
  db.prepare('DELETE FROM busqueda_anuncios WHERE identificador = ?').run(
    anuncio.identificador,
  );
  db.prepare('INSERT INTO busqueda_anuncios VALUES (?,?,?)').run(
    anuncio.identificador,
    anuncio.titulo,
    anuncio.texto,
  );
}

export function contarAnuncios(): number {
  const fila = abrirBd()
    .prepare('SELECT COUNT(*) AS n FROM anuncios_boe')
    .get() as { n: number };
  return fila.n;
}

export function buscarAnuncios(consulta: string, limite = 20): Array<{
  identificador: string;
  titulo: string;
}> {
  return abrirBd()
    .prepare(
      `SELECT identificador, titulo FROM busqueda_anuncios
       WHERE busqueda_anuncios MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all(consulta, limite) as Array<{ identificador: string; titulo: string }>;
}
