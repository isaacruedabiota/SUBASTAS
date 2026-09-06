import {
  consultaDesdeDireccion,
  normalizarCartociudad,
  type PuntoGeocodificado,
} from '@subastas/core';
import { fetchTexto } from '../../http';

/**
 * Cliente de Cartociudad, el geocodificador del IGN. Gratuito y sin clave.
 * Ver packages/core/src/schemas/cartociudad.ts para las trampas.
 */

const BUSCADOR = 'https://www.cartociudad.es/geocoder/api/geocoder/find';

/**
 * Coordenadas de una dirección, o null si no la resuelve con precisión.
 *
 * ⚠️ Cuando no encuentra nada responde **204 sin cuerpo**, no un JSON con
 * error. Hacer JSON.parse de eso lanza "Unexpected end of JSON input" y parece
 * un fallo de red cuando en realidad es un "no está".
 */
export async function geocodificar(
  direccion: string,
  localidad: string | null,
  provincia: string | null,
): Promise<PuntoGeocodificado | null> {
  const consulta = consultaDesdeDireccion(direccion, localidad, provincia);
  if (!consulta) return null;

  const texto = await fetchTexto(
    `${BUSCADOR}?q=${encodeURIComponent(consulta)}`,
    { headers: { Accept: 'application/json' } },
  );

  if (texto.trim() === '') return null;

  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return null; // respuesta no-JSON: se trata como "no encontrado"
  }

  return normalizarCartociudad(crudo);
}

export { consultaDesdeDireccion };
