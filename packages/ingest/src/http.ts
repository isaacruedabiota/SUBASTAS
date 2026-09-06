/**
 * Cliente HTTP común a todas las fuentes. Serializa las peticiones por host y
 * respeta un intervalo mínimo entre ellas: estas son APIs públicas gratuitas y
 * no se les debe meter presión.
 */

const RATE_LIMIT_MS = Number(process.env.INGEST_RATE_LIMIT_MS ?? 3000);
const USER_AGENT =
  process.env.INGEST_USER_AGENT ?? 'SubastasPersonal/0.1 (uso personal)';

/** Última petición y cola pendiente, por host. */
const colaPorHost = new Map<string, Promise<unknown>>();

async function esperar(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta `fn` en serie respecto a las demás llamadas al mismo host,
 * dejando al menos RATE_LIMIT_MS entre el final de una y el inicio de la siguiente.
 */
function enCola<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const anterior = colaPorHost.get(host) ?? Promise.resolve();
  const siguiente = anterior
    .catch(() => undefined) // un fallo previo no debe romper la cadena
    .then(async () => {
      const resultado = await fn();
      await esperar(RATE_LIMIT_MS);
      return resultado;
    });

  colaPorHost.set(host, siguiente);
  return siguiente;
}

export async function fetchTexto(
  url: string,
  init?: RequestInit,
): Promise<string> {
  const host = new URL(url).host;

  return enCola(host, async () => {
    const respuesta = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'es-ES,es;q=0.9',
        ...init?.headers,
      },
    });

    if (!respuesta.ok) {
      throw new Error(`${respuesta.status} ${respuesta.statusText} en ${url}`);
    }

    return respuesta.text();
  });
}

/**
 * Como `fetchTexto` pero devolviendo también estado y cookies, y **sin lanzar**
 * en 3xx. Lo necesita el login del Portal: la sesión llega en el `Set-Cookie` de
 * un 302 que no hay que seguir.
 */
export async function fetchConCookies(
  url: string,
  init?: RequestInit,
): Promise<{ estado: number; texto: string; cookies: string[] }> {
  const host = new URL(url).host;

  return enCola(host, async () => {
    const respuesta = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'es-ES,es;q=0.9',
        ...init?.headers,
      },
    });

    // 3xx es una respuesta válida aquí; solo los errores de verdad revientan.
    if (respuesta.status >= 400) {
      throw new Error(`${respuesta.status} ${respuesta.statusText} en ${url}`);
    }

    return {
      estado: respuesta.status,
      texto: await respuesta.text(),
      cookies: respuesta.headers.getSetCookie(),
    };
  });
}

/** Igual que fetchTexto pero para imágenes: respeta la misma cola por host. */
export async function fetchBinario(
  url: string,
  init?: RequestInit,
): Promise<{ datos: Buffer; tipo: string }> {
  const host = new URL(url).host;

  return enCola(host, async () => {
    const respuesta = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...init?.headers },
    });

    if (!respuesta.ok) {
      throw new Error(`${respuesta.status} ${respuesta.statusText} en ${url}`);
    }

    return {
      datos: Buffer.from(await respuesta.arrayBuffer()),
      tipo: respuesta.headers.get('content-type') ?? 'image/jpeg',
    };
  });
}
