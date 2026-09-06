import { borrarSuscripcion, guardarSuscripcion } from '@subastas/db/notificaciones';

/**
 * Alta y baja de suscripciones de Web Push.
 *
 * Es un route handler y no una Server Action porque lo que llega es el objeto
 * `PushSubscription` que fabrica el navegador —JSON puro— y aquí hay que
 * validarlo antes de guardarlo. Una acción de servidor no daría nada a cambio.
 *
 * No hay autenticación: la web es de un solo usuario y sin multiusuario no hay
 * a quién autorizar. Sí hay validación, porque esto es invocable por POST
 * directo.
 */

interface Cuerpo {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  etiqueta?: unknown;
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export async function POST(request: Request): Promise<Response> {
  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return Response.json({ error: 'Cuerpo no es JSON' }, { status: 400 });
  }

  const endpoint = texto(cuerpo.endpoint);
  const p256dh = texto(cuerpo.keys?.p256dh);
  const auth = texto(cuerpo.keys?.auth);

  /* Los tres son imprescindibles: el endpoint identifica el dispositivo y las
     dos claves cifran el mensaje. Sin alguna, la suscripción no sirve para
     nada y guardarla solo produciría fallos al enviar. */
  if (!endpoint || !p256dh || !auth) {
    return Response.json(
      { error: 'Faltan endpoint, keys.p256dh o keys.auth' },
      { status: 400 },
    );
  }

  // Los servicios de push son https. Cualquier otra cosa es un error o un abuso.
  if (!endpoint.startsWith('https://')) {
    return Response.json({ error: 'El endpoint debe ser https' }, { status: 400 });
  }

  guardarSuscripcion({ endpoint, p256dh, auth, etiqueta: texto(cuerpo.etiqueta) });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request): Promise<Response> {
  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return Response.json({ error: 'Cuerpo no es JSON' }, { status: 400 });
  }

  const endpoint = texto(cuerpo.endpoint);
  if (!endpoint) return Response.json({ error: 'Falta endpoint' }, { status: 400 });

  borrarSuscripcion(endpoint);
  return Response.json({ ok: true });
}
