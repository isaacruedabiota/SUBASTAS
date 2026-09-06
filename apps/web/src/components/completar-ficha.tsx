'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completarFicha } from '@/app/acciones';

/**
 * Completa al vuelo una ficha leída solo en lo básico.
 *
 * Las subastas que se anuncian a diario se leen con dos pestañas —datos y
 * bienes— para no pedirle al Portal cuatro páginas de cada una cuando la mayoría
 * no se van a mirar. Al abrir esta, el usuario la está mirando: se piden las que
 * faltan (autoridad gestora y pujas) y la ficha se recarga con todo.
 *
 * Mismo patrón que `Galeria`: efecto con guarda de `useRef` para que el
 * doble render de React en desarrollo no dispare dos lecturas.
 */
export function CompletarFicha({ identificador }: { identificador: string }) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const lanzado = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (lanzado.current) return;
    lanzado.current = true;

    empezar(async () => {
      const r = await completarFicha(identificador);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }, [identificador, router]);

  if (error !== null) {
    return (
      <p className="rounded-lg border border-riesgo-borde bg-riesgo-fondo px-3.5 py-2.5 text-xs text-riesgo">
        No se pudo completar la ficha: {error}
      </p>
    );
  }

  if (!pendiente) return null;

  return (
    <p className="flex items-center gap-2 rounded-lg border border-dato-borde bg-dato-fondo px-3.5 py-2.5 text-xs text-dato">
      <svg className="size-4 shrink-0 animate-spin" viewBox="0 0 24 24" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="opacity-20"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      Completando la ficha con el Portal: autoridad gestora y estado de la puja…
    </p>
  );
}
