import type { ReactNode } from 'react';
import { porcentaje } from '@/lib/formato';

/* --------------------------------------------------------------------------
   Piezas de interfaz compartidas. Sin dependencias: iconos SVG en línea.
-------------------------------------------------------------------------- */

export function Tarjeta({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-borde bg-superficie shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function TituloSeccion({
  children,
  icono,
  extra,
}: {
  children: ReactNode;
  icono?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-texto">
        {icono}
        {children}
      </h2>
      {extra}
    </div>
  );
}

/** Par etiqueta/valor. Es la unidad básica de toda la ficha. */
export function Dato({
  etiqueta,
  valor,
  nota,
  tono = 'normal',
  tamano = 'normal',
  mono,
}: {
  etiqueta: string;
  valor: ReactNode;
  nota?: ReactNode;
  tono?: 'normal' | 'riesgo' | 'oportunidad' | 'dato' | 'tenue';
  tamano?: 'normal' | 'grande';
  mono?: boolean;
}) {
  const tonos = {
    normal: 'text-texto',
    riesgo: 'text-riesgo',
    oportunidad: 'text-oportunidad',
    dato: 'text-dato',
    tenue: 'text-tenue',
  };

  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-tenue">
        {etiqueta}
      </dt>
      <dd
        className={[
          'tabular mt-1 break-words',
          // A 24px un importe como "47.421,39 €" no cabe en media columna de
          // móvil y parte el símbolo a la línea siguiente.
          tamano === 'grande'
            ? 'text-[19px] font-semibold sm:text-2xl'
            : 'text-sm font-medium',
          tonos[tono],
          mono ? 'font-mono text-xs' : '',
        ].join(' ')}
      >
        {valor}
      </dd>
      {nota ? <p className="mt-0.5 text-[11px] text-tenue">{nota}</p> : null}
    </div>
  );
}

/** Estado de la subasta, con punto de color. El activo late. */
export function Estado({ estado }: { estado: string | null }) {
  if (!estado) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-superficie-alta px-2.5 py-1 text-[11px] font-medium text-tenue">
        <span className="size-1.5 rounded-full bg-inactivo" />
        Ficha sin leer
      </span>
    );
  }

  const config: Record<string, { texto: string; clase: string; late?: boolean }> = {
    CELEBRANDOSE: {
      texto: 'En curso',
      clase: 'border-oportunidad-borde bg-oportunidad-fondo text-oportunidad',
      late: true,
    },
    PROXIMA_APERTURA: {
      texto: 'Próxima',
      clase: 'border-dato-borde bg-dato-fondo text-dato',
    },
    CONCLUIDA: {
      texto: 'Concluida',
      clase: 'border-borde bg-superficie-alta text-suave',
    },
    SUSPENDIDA: {
      texto: 'Suspendida',
      clase: 'border-riesgo-borde bg-riesgo-fondo text-riesgo',
    },
    CANCELADA: {
      texto: 'Cancelada',
      clase: 'border-riesgo-borde bg-riesgo-fondo text-riesgo',
    },
  };

  const c = config[estado] ?? {
    texto: estado,
    clase: 'border-borde bg-superficie-alta text-suave',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${c.clase}`}
    >
      <span className="relative flex size-1.5">
        {c.late ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        ) : null}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {c.texto}
    </span>
  );
}

/**
 * Barra que compara el valor de salida con la tasación.
 * Es la lectura de un vistazo: cuánto margen hay antes de pujar.
 */
export function BarraDescuento({
  tasacion,
  valorSubasta,
  pujaMaxima,
}: {
  tasacion: number | null;
  valorSubasta: number | null;
  pujaMaxima?: number | null;
}) {
  if (!tasacion || !valorSubasta || tasacion <= 0) return null;

  const pctSalida = Math.min(100, (valorSubasta / tasacion) * 100);
  const pctPuja =
    pujaMaxima && pujaMaxima > 0 ? Math.min(100, (pujaMaxima / tasacion) * 100) : null;
  const descuento = 100 - pctSalida;

  // Sin descuento la barra NO debe ir en verde: llena y de color de oportunidad
  // se lee como buena señal cuando significa justo lo contrario.
  const hayDescuento = descuento >= 1;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-tenue">Salida sobre tasación</span>
        <span
          className={
            hayDescuento ? 'font-semibold text-oportunidad' : 'font-medium text-tenue'
          }
        >
          {hayDescuento ? `−${porcentaje(descuento)}` : 'Sale por el 100%'}
        </span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-superficie-alta ring-1 ring-inset ring-borde">
        <div
          className={`barra-relleno h-full rounded-full transition-[width] duration-500 ${
            hayDescuento ? 'bg-oportunidad' : 'bg-inactivo'
          }`}
          style={{ '--pct': `${pctSalida}%` } as React.CSSProperties}
        />
        {pctPuja !== null ? (
          <span
            className="absolute top-0 h-full w-[3px] rounded-full bg-texto"
            style={{ left: `calc(${pctPuja}% - 1.5px)` }}
            title={`Puja máxima: ${pctPuja.toFixed(0)}% de la tasación`}
          />
        ) : null}
      </div>

      {pctPuja !== null ? (
        <p className="text-[11px] text-tenue">
          <span className="mr-1 inline-block h-2 w-[3px] translate-y-px rounded-full bg-texto align-middle" />
          Puja actual: {porcentaje(pctPuja)} de la tasación
        </p>
      ) : null}
    </div>
  );
}

/** Aviso destacado. Usado para el matiz de «no consta». */
export function Aviso({
  children,
  tono = 'riesgo',
}: {
  children: ReactNode;
  tono?: 'riesgo' | 'dato';
}) {
  const clases =
    tono === 'riesgo'
      ? 'border-riesgo-borde bg-riesgo-fondo text-riesgo'
      : 'border-dato-borde bg-dato-fondo text-dato';

  return (
    <div className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${clases}`}>
      <IconoAviso className="mt-0.5 size-4 shrink-0" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

/* ------------------------------ iconos ---------------------------------- */

type P = { className?: string };
const base = 'currentColor';

export function IconoAviso({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconoUbicacion({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path
        fillRule="evenodd"
        d="M9.69 18.933A7.5 7.5 0 0 0 10 19c.104 0 .208-.022.31-.067C13.02 17.7 16 13.86 16 9a6 6 0 0 0-12 0c0 4.86 2.98 8.7 5.69 9.933ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconoCasa({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3h4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7Z" />
    </svg>
  );
}

export function IconoMapa({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.157 2.176a1.5 1.5 0 0 0-1.147 0l-4.084 1.69A1.5 1.5 0 0 0 2 5.25v10.877a1.5 1.5 0 0 0 2.074 1.386l3.51-1.452 4.26 1.763a1.5 1.5 0 0 0 1.146 0l4.083-1.69A1.5 1.5 0 0 0 18 14.75V3.872a1.5 1.5 0 0 0-2.073-1.386l-3.51 1.452-4.26-1.762ZM7.5 3.799l4 1.655v10.746l-4-1.655V3.798Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconoDoc({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path
        fillRule="evenodd"
        d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2 6.5a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm.75 2.75a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconoBuscar({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconoReloj({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconoCamara({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path
        fillRule="evenodd"
        d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconoEuro({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={base} aria-hidden>
      <path d="M12.9 15.3a4.6 4.6 0 0 1-4.36-3.05h3.7l.4-1.3H8.28a5.3 5.3 0 0 1 0-.9h4.76l.4-1.3H8.54A4.6 4.6 0 0 1 12.9 5.7c.7 0 1.36.16 1.95.44l.55-1.44A6.1 6.1 0 0 0 12.9 4.2a6.1 6.1 0 0 0-5.9 4.55H5.4l-.4 1.3h1.76a6.9 6.9 0 0 0 0 .9H5.4l-.4 1.3h2a6.1 6.1 0 0 0 5.9 4.55c.9 0 1.75-.2 2.5-.55l-.55-1.44a4.6 4.6 0 0 1-1.95.49Z" />
    </svg>
  );
}
