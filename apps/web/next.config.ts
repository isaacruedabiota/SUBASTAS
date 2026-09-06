import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Los paquetes del workspace se publican como TypeScript sin compilar
   * (su `main` apunta a src/index.ts), así que Next tiene que transpilarlos.
   */
  transpilePackages: ['@subastas/core', '@subastas/db', '@subastas/ingest'],
};

export default nextConfig;
