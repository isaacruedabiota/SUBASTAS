import '../entorno';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Envío de correo por SMTP.
 *
 * **Por qué SMTP y no una API de correo.** El proyecto no usa servicios de pago
 * ni cuentas nuevas: SMTP lo tiene cualquier correo que ya se use. Con Gmail hay
 * que crear una **contraseña de aplicación** (la normal no vale desde que exige
 * verificación en dos pasos), y con eso ya funciona.
 *
 * Las credenciales van en `.env`, no en la BD: son de un servicio externo, es su
 * sitio, y así no viajan nunca al navegador.
 *
 *     SMTP_HOST=smtp.gmail.com
 *     SMTP_PUERTO=465
 *     SMTP_SEGURO=true
 *     SMTP_USUARIO=tucorreo@gmail.com
 *     SMTP_CLAVE=<contraseña de aplicación, 16 letras>
 *     SMTP_DESDE="Subastas <tucorreo@gmail.com>"
 */

export interface ConfigSmtp {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario: string;
  clave: string;
  desde: string;
}

export function configSmtp(): ConfigSmtp | null {
  const host = process.env.SMTP_HOST?.trim();
  const usuario = process.env.SMTP_USUARIO?.trim();
  const clave = process.env.SMTP_CLAVE;
  if (!host || !usuario || !clave) return null;

  /* 465 es SMTP sobre TLS desde el primer byte; 587 empieza en claro y sube con
     STARTTLS. Es la diferencia que `seguro` le comunica a nodemailer, y ponerla
     al revés da un timeout sin mensaje útil. */
  const puerto = Number(process.env.SMTP_PUERTO ?? 465);
  const seguro = (process.env.SMTP_SEGURO ?? String(puerto === 465)) === 'true';

  return {
    host,
    puerto,
    seguro,
    usuario,
    clave,
    desde: process.env.SMTP_DESDE?.trim() || `Subastas <${usuario}>`,
  };
}

export const smtpConfigurado = (): boolean => configSmtp() !== null;

let transporte: Transporter | null = null;

function abrirTransporte(cfg: ConfigSmtp): Transporter {
  transporte ??= nodemailer.createTransport({
    host: cfg.host,
    port: cfg.puerto,
    secure: cfg.seguro,
    auth: { user: cfg.usuario, pass: cfg.clave },
  });
  return transporte;
}

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html?: string;
}

export async function enviarCorreo(correo: Correo): Promise<void> {
  const cfg = configSmtp();
  if (!cfg) {
    throw new Error(
      'Falta la configuración SMTP en .env (SMTP_HOST, SMTP_USUARIO, SMTP_CLAVE).',
    );
  }

  await abrirTransporte(cfg).sendMail({
    from: cfg.desde,
    to: correo.para,
    subject: correo.asunto,
    text: correo.texto,
    html: correo.html,
  });
}

/** Comprueba que las credenciales valen, sin enviar nada. */
export async function probarSmtp(): Promise<void> {
  const cfg = configSmtp();
  if (!cfg) throw new Error('Falta la configuración SMTP en .env.');
  await abrirTransporte(cfg).verify();
}
