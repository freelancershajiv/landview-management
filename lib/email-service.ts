type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
};

type ResendResponse = {
  id?: string;
  name?: string;
  message?: string;
  error?: string;
};

export class EmailServiceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailServiceConfigurationError";
  }
}

function configuredSender() {
  return String(process.env.RESEND_FROM_EMAIL || "LAND VIEW Billing <billing@landview.com.bd>").trim();
}

export function emailServiceConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new EmailServiceConfigurationError(
      "Email service is not activated yet. Add RESEND_API_KEY to the Vercel project after verifying the LAND VIEW sending domain.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "LAND-VIEW-Management/1.0",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: configuredSender(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text();
  let data: ResendResponse = {};
  try {
    data = raw ? JSON.parse(raw) as ResendResponse : {};
  } catch {}

  if (!response.ok || !data.id) {
    const detail = String(data.message || data.error || data.name || `Resend returned HTTP ${response.status}.`).trim();
    throw new Error(`Email provider rejected the message: ${detail}`);
  }

  return { id: data.id, provider: "resend" as const };
}
