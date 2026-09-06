import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { contarAvisosPendientes } from '@subastas/db/alertas';
import { SelectorTema, type Tema } from '@/components/tema';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Subastas',
  description: 'Agregador personal de subastas públicas españolas',
};

/**
 * El tema se resuelve **en el servidor**, leyendo la cookie que escribe el
 * interruptor. Estampar `data-tema` aquí es lo que evita el parpadeo: el HTML
 * sale del servidor ya con el tema, sin script bloqueante ni segunda pintada.
 *
 * Sin cookie → oscuro, que es la preferencia declarada. `prefers-color-scheme`
 * no interviene: una elección explícita no debe depender del sistema.
 */
async function temaActual(): Promise<Tema> {
  const cookie = (await cookies()).get('tema')?.value;
  return cookie === 'claro' ? 'claro' : 'oscuro';
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tema = await temaActual();

  return (
    <html
      lang="es"
      data-tema={tema}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-borde bg-superficie/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3.5">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-texto"
            >
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-md bg-acento text-[13px] font-bold text-acento-texto"
              >
                S
              </span>
              Subastas
            </Link>

            <nav className="ml-4 flex items-center gap-1 text-sm">
              <Enlace href="/">Catálogo</Enlace>
              <Enlace href="/mapa">Mapa</Enlace>
              <Enlace href="/pujas">Pujas</Enlace>
              <Enlace href="/alertas">
                Alertas
                <ContadorAvisos />
              </Enlace>
              <Enlace href="/cuenta">Cuenta</Enlace>
              <Enlace href="/ajustes">Ajustes</Enlace>
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-[11px] text-tenue lg:block">
                BOE · Portal de Subastas · Catastro
              </span>
              <SelectorTema inicial={tema} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">{children}</main>

        <footer className="border-t border-borde">
          <div className="mx-auto max-w-6xl px-5 py-6 text-[11px] leading-relaxed text-tenue">
            Herramienta de uso personal. Datos de fuentes oficiales (BOE, Catastro),
            consultados bajo demanda y no redistribuidos. La información mostrada no
            sustituye a la ficha oficial de cada subasta.
          </div>
        </footer>
      </body>
    </html>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-suave transition hover:bg-superficie-alta hover:text-texto"
    >
      {children}
    </Link>
  );
}

/**
 * Se lee de la BD en cada render del layout. Es una cuenta trivial sobre SQLite
 * local, no merece ni caché ni Suspense.
 */
function ContadorAvisos() {
  const n = contarAvisosPendientes();
  if (n === 0) return null;
  return (
    <span className="tabular rounded-full bg-dato px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      {n}
    </span>
  );
}
