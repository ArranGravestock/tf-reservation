import nodemailer from "nodemailer";

/** True if SMTP is configured (we can send mail). */
export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** SMTP config for sending (e.g. Proton Mail direct SMTP: smtp.protonmail.ch:587). */
function getTransporter() {
  const host = process.env.SMTP_HOST ?? "smtp.protonmail.ch";
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true";

  if (!user || !pass) {
    throw new Error(
      "SMTP_USER and SMTP_PASS must be set to send email (e.g. Proton Mail custom-domain address and SMTP token)."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/** From address: SMTP_FROM or SMTP_USER. */
function getFrom(): string {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  const name = process.env.SMTP_FROM_NAME ?? "Terrible Football Liverpool";
  if (!from) throw new Error("SMTP_FROM or SMTP_USER must be set.");
  return name ? `"${name}" <${from}>` : from;
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: getFrom(),
    to,
    subject: "Verify your email – Terrible Football Liverpool",
    text: `Please verify your email by opening this link:\n\n${verifyUrl}\n\nIf you didn't create an account, you can ignore this email.`,
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;"><p>Please verify your email by opening this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you didn't create an account, you can ignore this email.</p></body></html>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: getFrom(),
    to,
    subject: "Reset your password – Terrible Football Liverpool",
    text: `Reset your password by opening this link:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request a reset, you can ignore this email.`,
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;"><p>Reset your password by opening this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you didn't request a reset, you can ignore this email.</p></body></html>`,
  });
}
