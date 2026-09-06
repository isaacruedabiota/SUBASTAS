import {
  CLAVE_ULTIMO_AVISO,
  leerAjuste,
  preferenciasAviso,
  urlWeb,
} from '@subastas/db/ajustes';
import { listarSuscripciones } from '@subastas/db/notificaciones';
import { asegurarClavesVapid, smtpConfigurado } from '@subastas/ingest/notificaciones';
import { Aviso, Tarjeta, TituloSeccion } from '@/components/ui';
import { BotonPush } from '@/components/push';
import { fecha } from '@/lib/formato';
import { enviarPrueba, guardarNotificaciones, quitarDispositivo } from './acciones';

export const dynamic = 'force-dynamic';

export default async function PaginaAjustes() {
  const prefs = preferenciasAviso();
  const dispositivos = listarSuscripciones();
  const resultado = leerAjuste(CLAVE_ULTIMO_AVISO);
  const smtp = smtpConfigurado();

  /* Se generan solas la primera vez que se abre esta página. No hay que
     registrarse en ningún sitio ni pegar ninguna clave en un fichero. */
  const { publica } = asegurarClavesVapid();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-texto">Ajustes</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-suave">
          Cuando una alerta encuentra una subasta que encaja, genera un aviso. Aquí se
          decide si además sale de esta web: al correo, al móvil, o a los dos.
        </p>
      </div>

      {resultado ? <Aviso tono="dato">{resultado}</Aviso> : null}

      {/* ---------------- Vías de aviso ---------------- */}
      <Tarjeta>
        <TituloSeccion>Cómo quieres enterarte</TituloSeccion>

        <form action={guardarNotificaciones} className="space-y-5 p-5">
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="correo"
                value="1"
                defaultChecked={prefs.correo}
                className="mt-0.5 size-4 accent-[var(--dato)]"
              />
              <span className="text-sm">
                <span className="font-medium text-texto">Por correo</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-tenue">
                  Un mensaje por tanda con todas las subastas nuevas, no uno por cada
                  una.
                </span>
              </span>
            </label>

            <div className="ml-7 max-w-md">
              <input
                name="correoDestino"
                type="email"
                defaultValue={prefs.correoDestino ?? ''}
                placeholder="tucorreo@ejemplo.com"
                className={control}
              />
              {!smtp ? (
                <p className="mt-2 text-xs leading-relaxed text-riesgo">
                  Falta el servidor de salida. Añade a{' '}
                  <code className="font-mono">.env</code> las líneas{' '}
                  <code className="font-mono">SMTP_HOST</code>,{' '}
                  <code className="font-mono">SMTP_USUARIO</code> y{' '}
                  <code className="font-mono">SMTP_CLAVE</code> —con Gmail hay que crear
                  una <strong>contraseña de aplicación</strong>, la normal ya no vale— y
                  reinicia <code className="font-mono">npm run dev</code>. Está todo en{' '}
                  <code className="font-mono">.env.example</code>.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 border-t border-borde pt-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="push"
                value="1"
                defaultChecked={prefs.push}
                className="mt-0.5 size-4 accent-[var(--dato)]"
              />
              <span className="text-sm">
                <span className="font-medium text-texto">
                  Como notificación en el móvil
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-tenue">
                  Llega aunque la web esté cerrada. Hay que dar permiso en cada
                  dispositivo, aquí debajo.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-1.5 border-t border-borde pt-4">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-tenue">
              Dirección de esta web
            </label>
            <input
              name="urlWeb"
              defaultValue={urlWeb()}
              placeholder="http://localhost:3000"
              className={`${control} max-w-md font-mono text-xs`}
            />
            <p className="text-xs leading-relaxed text-tenue">
              Es la dirección que se pone en los enlaces de los avisos.{' '}
              <code className="font-mono">localhost</code> solo funciona si los abres en
              este mismo ordenador: para que un enlace del móvil lleve a algún sitio, aquí
              va la dirección por la que entras desde el móvil.
            </p>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-acento px-5 py-2.5 text-sm font-medium text-acento-texto transition hover:opacity-90"
          >
            Guardar
          </button>
        </form>
      </Tarjeta>

      {/* ---------------- Este dispositivo ---------------- */}
      <Tarjeta>
        <TituloSeccion
          extra={
            <form action={enviarPrueba}>
              <button className="text-xs font-medium text-dato hover:underline">
                Enviar una prueba
              </button>
            </form>
          }
        >
          Notificaciones en este dispositivo
        </TituloSeccion>

        <div className="space-y-4 p-5">
          <BotonPush clavePublica={publica} />

          {dispositivos.length > 0 ? (
            <ul className="divide-y divide-borde border-t border-borde">
              {dispositivos.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-texto">{d.etiqueta ?? 'Dispositivo'}</p>
                    <p className="mt-0.5 text-[11px] text-tenue">
                      Dado de alta el {fecha(d.creadaEn)}
                      {d.ultimoUsoEn ? ` · último aviso el ${fecha(d.ultimoUsoEn)}` : ''}
                    </p>
                    {d.ultimoError ? (
                      <p className="mt-0.5 text-[11px] text-riesgo">{d.ultimoError}</p>
                    ) : null}
                  </div>
                  <form action={quitarDispositivo}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="rounded-md border border-borde px-2.5 py-1.5 text-xs text-riesgo transition hover:border-riesgo-borde">
                      Quitar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Tarjeta>

      {/* ---------------- Acceso desde fuera ---------------- */}
      <Tarjeta>
        <TituloSeccion>Ver esto desde fuera de casa</TituloSeccion>

        <div className="space-y-4 p-5 text-sm leading-relaxed text-suave">
          <p>
            El servidor es este ordenador, y <strong>todo se descarga aquí</strong>: las
            fichas del Portal, las fotos, las ortofotos del IGN y la base de datos. Cuando
            abres la web desde el móvil, el móvil no descarga nada de esas fuentes — le
            pide las páginas y las imágenes a este ordenador, que responde con lo que ya
            tiene guardado. Si algo no está aún, lo pide él y lo guarda: la siguiente vez
            ya no hace falta.
          </p>
          <p>
            La consecuencia es que <strong>este ordenador tiene que estar encendido</strong>{' '}
            para poder mirar nada desde fuera, y que el resto de dispositivos no acumulan
            copias de nada.
          </p>

          <div className="rounded-lg border border-borde bg-superficie-alta p-4">
            <p className="text-sm font-medium text-texto">
              Ahora mismo solo se llega desde tu red
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-tenue">
              Para llegar desde cualquier sitio hay tres caminos, y no son equivalentes:
            </p>

            <dl className="mt-3 space-y-3 text-xs leading-relaxed">
              <div>
                <dt className="font-medium text-texto">
                  Tailscale — lo que encaja aquí
                </dt>
                <dd className="mt-0.5 text-tenue">
                  Monta una red privada entre tus dispositivos. No abre ningún puerto del
                  router, no expone nada a Internet y{' '}
                  <code className="font-mono">tailscale serve</code> da{' '}
                  <strong>HTTPS con certificado válido</strong>, que es justo lo que
                  hace falta para que funcionen las notificaciones push y para poder
                  instalar la web en el móvil. Es gratis para uso personal.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-texto">Cloudflare Tunnel</dt>
                <dd className="mt-0.5 text-tenue">
                  También da HTTPS sin abrir puertos, pero publica la web{' '}
                  <strong>en Internet</strong>. Con una página que guarda la contraseña
                  del Portal, eso exige poner autenticación delante antes de encenderlo.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-riesgo">Abrir un puerto del router</dt>
                <dd className="mt-0.5 text-tenue">
                  Deja tu ordenador expuesto, sin HTTPS y sin autenticación. No lo hagas.
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-xs text-tenue">
            Con cualquiera de los dos primeros, acuérdate de poner arriba la dirección
            nueva para que los enlaces de los avisos lleven a algún sitio.
          </p>
        </div>
      </Tarjeta>
    </div>
  );
}

const control =
  'w-full rounded-lg border border-borde bg-fondo px-2.5 py-2 text-sm text-texto placeholder:text-tenue focus:border-borde-fuerte focus:outline-none';
