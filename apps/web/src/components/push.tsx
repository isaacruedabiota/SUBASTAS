'use client';

import { useEffect, useState } from 'react';

/**
 * Permiso de notificaciones en este dispositivo.
 *
 * Suscribirse es una operación del navegador, no del servidor: hay que pedir
 * permiso, registrar el service worker y sacarle al `PushManager` un endpoint
 * con dos claves. Eso solo se puede hacer aquí. Lo que se manda al servidor es
 * el resultado, que se guarda en `suscripciones_push`.
 *
 * **La suscripción es por dispositivo.** Cada móvil y cada navegador tiene la
 * suya; darse de alta en el portátil no hace que lleguen avisos al teléfono.
 *
 * ⚠️ Los dos motivos por los que esto no aparece, y ninguno es un fallo:
 *
 * - **Sin HTTPS no hay service worker.** El navegador lo exige en contexto
 *   seguro; `localhost` está exento, pero `http://192.168.1.x` no. Es el caso
 *   típico de abrir la web desde el móvil por la IP local.
 * - **En iOS hay que instalarla antes.** Safari no da push a una pestaña; solo
 *   a la web añadida a la pantalla de inicio.
 */

/**
 * La clave VAPID viaja en base64url y el navegador la quiere en bytes.
 *
 * El `new ArrayBuffer(...)` explícito no es adorno: `new Uint8Array(n)` se
 * tipa como `Uint8Array<ArrayBufferLike>`, que TypeScript no acepta donde se
 * espera un `BufferSource` (podría estar respaldado por un SharedArrayBuffer).
 * Construyéndolo sobre un ArrayBuffer normal el tipo ya encaja.
 */
function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

type Estado =
  | 'cargando'
  | 'sin-soporte'
  | 'sin-https'
  | 'bloqueado'
  | 'sin-suscribir'
  | 'suscrito';

export function BotonPush({ clavePublica }: { clavePublica: string }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    (async () => {
      if (!window.isSecureContext) return setEstado('sin-https');
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return setEstado('sin-soporte');
      }
      if (Notification.permission === 'denied') return setEstado('bloqueado');

      try {
        const registro = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        const sub = await registro.pushManager.getSubscription();
        setEstado(sub ? 'suscrito' : 'sin-suscribir');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setEstado('sin-soporte');
      }
    })();
  }, []);

  async function suscribir() {
    setTrabajando(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'sin-suscribir');
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.subscribe({
        // Obligatorio: el navegador no permite push silencioso.
        userVisibleOnly: true,
        applicationServerKey: claveABytes(clavePublica),
      });

      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), etiqueta: nombreDispositivo() }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'El servidor rechazó el alta');

      setEstado('suscrito');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function anular() {
    setTrabajando(true);
    setError(null);
    try {
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado('sin-suscribir');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="space-y-2">
      {estado === 'cargando' ? (
        <p className="text-xs text-tenue">Comprobando este dispositivo…</p>
      ) : null}

      {estado === 'sin-https' ? (
        <Nota tono="riesgo">
          Este navegador no permite notificaciones porque la web no va por{' '}
          <strong>HTTPS</strong>. Funciona en <code className="font-mono">localhost</code>
          , pero no por la IP de la red local. Más abajo, en «Ver esto desde fuera de
          casa», está la forma de conseguir HTTPS sin abrir puertos.
        </Nota>
      ) : null}

      {estado === 'sin-soporte' ? (
        <Nota tono="riesgo">
          Este navegador no admite notificaciones push. En iPhone hay que{' '}
          <strong>añadir la web a la pantalla de inicio</strong> primero: Safari no las da
          desde una pestaña normal.
        </Nota>
      ) : null}

      {estado === 'bloqueado' ? (
        <Nota tono="riesgo">
          Las notificaciones están <strong>bloqueadas</strong> para este sitio. Hay que
          permitirlas desde los ajustes del navegador; una vez denegado, la web ya no
          puede volver a preguntar.
        </Nota>
      ) : null}

      {estado === 'sin-suscribir' ? (
        <button
          type="button"
          onClick={suscribir}
          disabled={trabajando}
          className="rounded-lg bg-acento px-4 py-2 text-sm font-medium text-acento-texto transition hover:opacity-90 disabled:opacity-60"
        >
          {trabajando ? 'Pidiendo permiso…' : 'Activar en este dispositivo'}
        </button>
      ) : null}

      {estado === 'suscrito' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-oportunidad-borde bg-oportunidad-fondo px-2.5 py-1 text-[11px] font-medium text-oportunidad">
            <span className="size-1.5 rounded-full bg-current" />
            Este dispositivo recibirá los avisos
          </span>
          <button
            type="button"
            onClick={anular}
            disabled={trabajando}
            className="rounded-md border border-borde px-2.5 py-1.5 text-xs text-suave transition hover:border-borde-fuerte hover:text-texto disabled:opacity-60"
          >
            {trabajando ? 'Quitando…' : 'Dejar de recibirlos aquí'}
          </button>
        </div>
      ) : null}

      {error ? <Nota tono="riesgo">{error}</Nota> : null}
    </div>
  );
}

function Nota({ children, tono }: { children: React.ReactNode; tono: 'riesgo' | 'dato' }) {
  const clases =
    tono === 'riesgo'
      ? 'border-riesgo-borde bg-riesgo-fondo text-riesgo'
      : 'border-dato-borde bg-dato-fondo text-dato';
  return (
    <p className={`rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed ${clases}`}>
      {children}
    </p>
  );
}

/** Una pista para distinguir dispositivos en la lista, sin husmear nada. */
function nombreDispositivo(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone o iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'Navegador';
}
