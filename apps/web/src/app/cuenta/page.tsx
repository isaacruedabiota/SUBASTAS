import { listarCuentas, type CuentaPortal } from '@subastas/db/cuentas';
import { asegurarCuentas } from '@subastas/ingest/sesion';
import { Aviso, Tarjeta, TituloSeccion } from '@/components/ui';
import { fecha } from '@/lib/formato';
import {
  anadirCuenta,
  cancelarCodigoDe,
  cerrarSesionDe,
  conmutarCuenta,
  editarCuenta,
  enviarCodigoDe,
  pedirCodigoDe,
  quitarCuenta,
} from './acciones';

export const dynamic = 'force-dynamic';

export default async function PaginaCuenta() {
  // Trae la cuenta que estuviera en .env, la primera vez y solo la primera.
  asegurarCuentas();

  const cuentas = listarCuentas();
  const enSesion = cuentas.find((c) => c.activa && c.sesionAbiertaEn !== null) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-texto">
          Cuentas del Portal
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-suave">
          Con sesión iniciada, el Portal publica el <strong>importe de la puja</strong> de
          las subastas en curso. Sin ella dice solo si hay pujas o no, y la ficha lo
          refleja tal cual: «hay pujas, importe reservado».
        </p>
      </div>

      <EstadoSesion cuenta={enSesion} />

      <Tarjeta>
        <TituloSeccion>Cuentas guardadas</TituloSeccion>

        {cuentas.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-tenue">
            Ninguna todavía. Añade abajo la del Portal de Subastas.
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {cuentas.map((c) => (
              <li key={c.id} className="p-5">
                <FilaCuenta cuenta={c} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Añadir una cuenta</TituloSeccion>
        <form action={anadirCuenta} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Nombre">
              <input name="etiqueta" placeholder="La mía" className={control} />
            </Campo>
            <Campo etiqueta="Usuario">
              <input
                name="usuario"
                required
                autoComplete="off"
                placeholder="correo o NIF"
                className={control}
              />
            </Campo>
            <Campo etiqueta="Contraseña">
              <input
                name="clave"
                type="password"
                required
                autoComplete="new-password"
                className={control}
              />
            </Campo>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-acento px-5 py-2.5 text-sm font-medium text-acento-texto transition hover:opacity-90"
          >
            Guardar cuenta
          </button>
        </form>
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Cómo se consigue una cuenta</TituloSeccion>
        <div className="space-y-3 p-5 text-sm leading-relaxed text-suave">
          <p>
            El alta está en{' '}
            <a
              href="https://subastas.boe.es/infoRegistro.php"
              target="_blank"
              rel="noreferrer"
              className="text-dato hover:underline"
            >
              subastas.boe.es/infoRegistro.php
            </a>{' '}
            y exige <strong>Cl@ve o certificado digital</strong>. De ese registro salen un
            usuario y una contraseña, que son los que van aquí.
          </p>
          <p className="text-xs text-tenue">
            Iniciar sesión sirve solo para ver importes que esa cuenta tiene derecho a
            ver. No habilita nada más: se sigue leyendo una subasta por identificador y
            solo cuando se abre, nunca recorriendo el sitio.
          </p>
        </div>
      </Tarjeta>

      <Aviso>
        La contraseña se guarda <strong>en claro</strong> en{' '}
        <code className="font-mono">data/subastas.db</code>, igual que antes estaba en{' '}
        <code className="font-mono">.env</code>. Ese fichero está fuera de git, pero si
        publicas esta web fuera de tu red, protégela primero — abajo, en Ajustes, hay una
        nota sobre cómo. La contraseña nunca se devuelve al navegador: el formulario de
        edición viene vacío.
      </Aviso>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EstadoSesion({ cuenta }: { cuenta: CuentaPortal | null }) {
  if (!cuenta) {
    return (
      <Aviso tono="dato">
        No hay ninguna sesión abierta. Las subastas en curso con pujas se muestran como
        «hay pujas, importe reservado», que es lo que el Portal dice a un visitante
        anónimo. Todo lo demás funciona igual.
      </Aviso>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-oportunidad-borde bg-oportunidad-fondo px-4 py-3 text-sm text-oportunidad">
      <span className="size-1.5 rounded-full bg-current" />
      <strong>Sesión abierta</strong>
      <span>como {cuenta.usuario}</span>
      <span className="text-xs opacity-80">desde el {fecha(cuenta.sesionAbiertaEn)}</span>
    </div>
  );
}

function FilaCuenta({ cuenta: c }: { cuenta: CuentaPortal }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-texto">
            <span
              className={`size-1.5 rounded-full ${c.activa ? 'bg-activo' : 'bg-inactivo'}`}
            />
            {c.etiqueta}
          </p>
          <p className="mt-1 font-mono text-xs text-tenue">{c.usuario}</p>
          <p className="mt-1 text-xs text-suave">
            {c.sesionAbiertaEn
              ? `Sesión abierta el ${fecha(c.sesionAbiertaEn)}`
              : c.esperandoCodigo
                ? 'Esperando el código de verificación'
                : 'Sin sesión'}
            {c.activa ? '' : ' · desactivada'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {c.sesionAbiertaEn ? (
            <BotonForm accion={cerrarSesionDe} id={c.id}>
              Cerrar sesión
            </BotonForm>
          ) : c.esperandoCodigo ? null : (
            <BotonForm accion={pedirCodigoDe} id={c.id} destacado>
              Iniciar sesión
            </BotonForm>
          )}
          <BotonForm accion={conmutarCuenta} id={c.id}>
            {c.activa ? 'Desactivar' : 'Activar'}
          </BotonForm>
          <BotonForm accion={quitarCuenta} id={c.id} riesgo>
            Borrar
          </BotonForm>
        </div>
      </div>

      {c.esperandoCodigo ? <FormularioCodigo cuenta={c} /> : null}

      {c.ultimoError ? (
        <p className="whitespace-pre-wrap rounded-lg border border-riesgo-borde bg-riesgo-fondo px-3.5 py-2.5 text-xs leading-relaxed text-riesgo">
          {c.ultimoError}
        </p>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer text-tenue hover:text-suave">
          Cambiar usuario o contraseña
        </summary>
        <form action={editarCuenta} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="id" value={c.id} />
          <input
            name="etiqueta"
            defaultValue={c.etiqueta}
            placeholder="Nombre"
            className={control}
          />
          <input
            name="usuario"
            defaultValue={c.usuario}
            autoComplete="off"
            className={control}
          />
          <input
            name="clave"
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña (opcional)"
            className={control}
          />
          <button className="rounded-lg border border-borde px-3 py-2 text-xs text-suave transition hover:border-borde-fuerte hover:text-texto">
            Guardar
          </button>
        </form>
      </details>
    </div>
  );
}

/**
 * El segundo factor. El Portal manda el código al correo Y al móvil.
 *
 * ⚠️ No hay botón de «reenviar»: pedirlo otra vez **anula el código anterior**,
 * y quien acaba de recibirlo por SMS suele estar a punto de teclearlo. Si algo
 * ha salido mal, primero se cancela y luego se vuelve a empezar.
 */
function FormularioCodigo({ cuenta: c }: { cuenta: CuentaPortal }) {
  return (
    <div className="rounded-lg border border-dato-borde bg-dato-fondo p-4">
      <p className="text-sm font-medium text-dato">
        El Portal ha enviado un código a tu correo y a tu móvil
      </p>
      <p className="mt-1 text-xs leading-relaxed text-dato opacity-90">
        Pedido el {fecha(c.pendienteEn)}. Tecléalo aquí. Si vuelves a pedirlo, el que
        acabas de recibir dejará de valer.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={enviarCodigoDe} className="flex flex-1 gap-2">
          <input type="hidden" name="id" value={c.id} />
          <input
            name="codigo"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="text"
            placeholder="Código"
            className={`${control} max-w-40 font-mono tracking-widest uppercase`}
          />
          <button className="rounded-lg bg-acento px-4 py-2 text-sm font-medium text-acento-texto transition hover:opacity-90">
            Entrar
          </button>
        </form>
        <BotonForm accion={cancelarCodigoDe} id={c.id}>
          Cancelar
        </BotonForm>
      </div>
    </div>
  );
}

function BotonForm({
  accion,
  id,
  children,
  destacado,
  riesgo,
}: {
  accion: (formData: FormData) => Promise<void>;
  id: number;
  children: React.ReactNode;
  destacado?: boolean;
  riesgo?: boolean;
}) {
  const clase = destacado
    ? 'bg-acento text-acento-texto hover:opacity-90 border-transparent'
    : riesgo
      ? 'border-borde text-riesgo hover:border-riesgo-borde'
      : 'border-borde text-suave hover:border-borde-fuerte hover:text-texto';

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <button
        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${clase}`}
      >
        {children}
      </button>
    </form>
  );
}

const control =
  'w-full rounded-lg border border-borde bg-fondo px-2.5 py-2 text-sm text-texto placeholder:text-tenue focus:border-borde-fuerte focus:outline-none';

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-tenue">
        {etiqueta}
      </span>
      {children}
    </label>
  );
}
