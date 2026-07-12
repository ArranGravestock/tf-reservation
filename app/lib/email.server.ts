import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email sending.
 *
 * In local development, run Mailpit (see docker-compose.yml) and point the app
 * at it with SMTP_HOST/SMTP_PORT. Caught emails show up at http://localhost:8025.
 *
 * If no SMTP host is configured we fall back to logging the message to the
 * console, so the app still works without any mail setup.
 */

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 1025;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === "true"; // true for 465, false for 587 (STARTTLS) / 1025
const MAIL_FROM = process.env.MAIL_FROM ?? "Terrible Football Liverpool <no-reply@tf-liverpool.local>";

// Amazon SES tenant attribution (Option B — SMTP). When SES_TENANT is set we
// attach the X-SES-* headers SES requires for tenant/config-set attribution;
// SES strips them before delivery. Left unset for local Mailpit dev.
const SES_TENANT = process.env.SES_TENANT;
const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET;

function sesHeaders(): Record<string, string> | undefined {
  if (!SES_TENANT) return undefined;
  const headers: Record<string, string> = { "X-SES-TENANT": SES_TENANT };
  if (SES_CONFIGURATION_SET) headers["X-SES-CONFIGURATION-SET"] = SES_CONFIGURATION_SET;
  return headers;
}

let transporter: Transporter | null | undefined;

/** Returns true when an SMTP server (e.g. Mailpit) is configured. */
export function isEmailConfigured(): boolean {
  return Boolean(SMTP_HOST);
}

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!SMTP_HOST) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    // For SES (port 587 STARTTLS) require the TLS upgrade so we never fall back
    // to sending credentials/mail in plaintext. Left off for local Mailpit.
    requireTLS: !SMTP_SECURE && Boolean(SES_TENANT),
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS ?? "" } : undefined,
  });
  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail({ to, subject, text, html }: SendMailOptions): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.warn(
      `[email] SMTP not configured (SMTP_HOST unset); NOT sending "${subject}" to ${to}. Link/content only logged in dev.`
    );
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] (dev) would send to ${to}: ${subject}\n${text}`);
    }
    return;
  }
  const startedAt = Date.now();
  console.log(
    `[email] sending "${subject}" to ${to} via ${SMTP_HOST}:${SMTP_PORT}` +
      `${SES_TENANT ? ` (SES tenant=${SES_TENANT})` : ""}`
  );
  try {
    const info = await t.sendMail({ from: MAIL_FROM, to, subject, text, html, headers: sesHeaders() });
    console.log(
      `[email] sent "${subject}" to ${to} in ${Date.now() - startedAt}ms — ` +
        `messageId=${info.messageId ?? "?"} ` +
        `accepted=${JSON.stringify(info.accepted ?? [])} ` +
        `rejected=${JSON.stringify(info.rejected ?? [])} ` +
        `response=${JSON.stringify(info.response ?? "")}`
    );
    if (info.rejected && info.rejected.length > 0) {
      console.error(`[email] server REJECTED recipients for "${subject}": ${JSON.stringify(info.rejected)}`);
    }
  } catch (err) {
    console.error(
      `[email] FAILED to send "${subject}" to ${to} after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err
    );
    throw err;
  }
}

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f7;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c1e;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
      <h1 style="font-size:20px;margin:0 0 16px;">${heading}</h1>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#f56772;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:500;">${label}</a>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendVerificationEmail(to: string, verifyUrl: string, username: string): Promise<void> {
  await sendMail({
    to,
    subject: "Verify your email – Terrible Football Liverpool",
    text: `Hi ${username},\n\nPlease verify your email to finish setting up your account:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: layout(
      `Terrible Football <span style="background:linear-gradient(90deg,#f56772,#8b1e24);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#8b1e24;">Liverpool</span>`,
      `<p style="font-size:15px;line-height:1.5;">Hi <strong>${escapeHtml(username)}</strong>,</p>
       <p style="font-size:15px;line-height:1.5;">Please verify your email to finish setting up your account.</p>
       <p style="margin:24px 0;text-align:center;">${button(verifyUrl, "Verify email")}</p>
       <p style="font-size:13px;color:#8e8e93;word-break:break-all;overflow-wrap:anywhere;">This link expires in 24 hours. If the button doesn't work, press or copy this link: <a href="${verifyUrl}" style="color:#f56772;">${verifyUrl}</a></p>`
    ),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "Reset your password – Terrible Football Liverpool",
    text: `We received a request to reset your password. Use this link to choose a new one:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: layout(
      "Reset your password",
      `<p style="font-size:15px;line-height:1.5;">We received a request to reset your password. Choose a new one below.</p>
       <p style="margin:24px 0;">${button(resetUrl, "Reset password")}</p>
       <p style="font-size:13px;color:#8e8e93;word-break:break-all;overflow-wrap:anywhere;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`
    ),
  });
}
