'use client';

import { useState } from 'react';

/**
 * Interruptor de tema. Oscuro por defecto, claro a petición.
 *
 * El tema real lo pinta el servidor: el layout lee la cookie `tema` y estampa
 * `data-tema` en <html>, así que el HTML llega ya con los colores puestos y no
 * hay parpadeo. Este componente solo se encarga del cambio en caliente:
 *
 * 1. mueve el atributo del <html> — el cambio es inmediato, sin recargar;
 * 2. escribe la cookie para que la siguiente petición se pinte igual.
 *
 * No hay Server Action ni `router.refresh()` a propósito: cambiar de tema no
 * toca ningún dato, y un viaje al servidor solo añadiría un salto visible.
 */

export type Tema = 'claro' | 'oscuro';

/** Un año: la preferencia de tema no caduca en la práctica. */
const UN_ANIO = 60 * 60 * 24 * 365;

export function SelectorTema({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial);

  function alternar() {
    const siguiente: Tema = tema === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.dataset.tema = siguiente;
    document.cookie = `tema=${siguiente}; path=/; max-age=${UN_ANIO}; samesite=lax`;
    setTema(siguiente);
  }

  const aOscuro = tema === 'claro';

  return (
    <button
      type="button"
      onClick={alternar}
      title={aOscuro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      aria-label={aOscuro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      className="grid size-8 place-items-center rounded-md text-suave transition hover:bg-superficie-alta hover:text-texto"
    >
      {aOscuro ? <IconoLuna className="size-4" /> : <IconoSol className="size-4" />}
    </button>
  );
}

function IconoSol({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2Zm5.657 2.343a.75.75 0 0 1 0 1.061l-1.06 1.06a.75.75 0 1 1-1.061-1.06l1.06-1.06a.75.75 0 0 1 1.061 0ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10Zm-2.343 5.657a.75.75 0 0 1-1.06 0l-1.061-1.06a.75.75 0 1 1 1.06-1.061l1.061 1.06a.75.75 0 0 1 0 1.061ZM10 16a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 16Zm-5.657-.343a.75.75 0 0 1 0-1.06l1.06-1.061a.75.75 0 1 1 1.061 1.06l-1.06 1.061a.75.75 0 0 1-1.061 0ZM4 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 4 10Zm2.343-5.657a.75.75 0 0 1 1.06 1.06l-1.06 1.061a.75.75 0 0 1-1.061-1.06l1.06-1.061ZM10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    </svg>
  );
}

function IconoLuna({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
