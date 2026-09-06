'use client';

import { useActionState } from 'react';
import { consultarFicha, type ResultadoConsulta } from '@/app/acciones';

/**
 * Botón que dispara la lectura de la ficha en el Portal.
 *
 * La operación son cuatro peticiones encadenadas más Catastro, con rate limit:
 * tarda del orden de 10-15 s. Por eso el estado de espera es explícito y avisa
 * de que hay que esperar, en vez de dejar la página aparentemente colgada.
 */
export function BotonConsultar({ id }: { id: string }) {
  const [estado, accion, pendiente] = useActionState<ResultadoConsulta | null, FormData>(
    consultarFicha,
    null,
  );

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      <button
        type="submit"
        disabled={pendiente}
        className="inline-flex items-center gap-2.5 rounded-lg bg-acento px-4 py-2.5 text-sm font-medium text-acento-texto transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      >
        {pendiente ? (
          <>
            <Girando />
            Consultando el Portal…
          </>
        ) : (
          <>Consultar ficha en el Portal</>
        )}
      </button>

      {pendiente ? (
        <p className="text-xs text-tenue">
          Puede tardar unos segundos: se leen las cuatro pestañas de la ficha y, si
          trae referencia catastral, se consulta también el Catastro.
        </p>
      ) : null}

      {estado && !estado.ok ? (
        <p className="rounded-lg border border-riesgo-borde bg-riesgo-fondo px-3 py-2 text-xs text-riesgo">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}

function Girando() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}
