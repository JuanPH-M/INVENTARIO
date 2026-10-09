import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envío de correo vía SMTP. En desarrollo apunta a Mailhog (localhost:1025).
 * Si no hay SMTP configurado, registra el mensaje en el log en lugar de fallar,
 * para que flujos como "olvidé mi contraseña" puedan probarse sin servidor de correo.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = process.env['SMTP_HOST'];
    this.from = process.env['SMTP_FROM'] ?? 'Inventario Pro <no-reply@inventario.local>';
    if (!host) {
      this.transporter = null;
      return;
    }
    const user = process.env['SMTP_USER'];
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env['SMTP_PORT'] ?? 587),
      secure: process.env['SMTP_SECURE'] === 'true',
      auth: user ? { user, pass: process.env['SMTP_PASS'] ?? '' } : undefined,
    });
  }

  async send(message: MailMessage): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`SMTP no configurado. Correo para ${message.to}: "${message.subject}"`);
      if (this.config.get<string>('app.nodeEnv') !== 'production') {
        this.logger.log(message.text ?? message.html);
      }
      return false;
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar el correo a ${message.to}: ${(err as Error).message}`);
      if (this.config.get<string>('app.nodeEnv') !== 'production') {
        this.logger.log(message.text ?? message.html);
      }
      return false;
    }
  }

  /** Plantilla HTML sobria y compatible con clientes de correo. */
  layout(title: string, body: string): string {
    return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%">
<tr><td style="background:#0f172a;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:600">Inventario Pro</td></tr>
<tr><td style="padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${title}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">Este es un mensaje automático, no respondas a este correo.</td></tr>
</table></td></tr></table></body></html>`;
  }
}
