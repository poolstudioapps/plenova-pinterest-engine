import "server-only";

/**
 * Outgoing mail, for one message: the sign-in code.
 *
 * Resend, because the domain is already owned and verifying it there is a DNS
 * record rather than a project. No SDK - it is one POST, and a dependency for
 * one call is a dependency to keep updated forever.
 */

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && mailFrom());
}

function mailFrom(): string {
  return process.env.MAIL_FROM ?? "Plenova Studio <studio@latelierugc.com>";
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendLoginCode(
  email: string,
  code: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    /*
     * No provider. In development that is normal, and printing the code to the
     * server console is how you sign in locally. In production it is a
     * misconfiguration the caller turns into a 503 - it must never silently
     * behave as though the mail went out.
     */
    if (process.env.NODE_ENV !== "production") {
      console.warn(`\n[auth] code de connexion pour ${email} : ${code}\n`);
      return { sent: true, reason: "console" };
    }
    return { sent: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [email],
        subject: `${code} — ton code Plenova Studio`,
        text: [
          `Ton code de connexion : ${code}`,
          "",
          "Il est valable 10 minutes et ne sert qu'une fois.",
          "Si tu n'as rien demandé, ignore ce message : sans le code, personne n'entre.",
        ].join("\n"),
        html: `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#0e1a0c">
  <p style="margin:0 0 24px;font-size:14px;color:#6b7869">Plenova Studio</p>
  <p style="margin:0 0 8px;font-size:15px">Ton code de connexion :</p>
  <p style="margin:0 0 24px;font-size:34px;font-weight:700;letter-spacing:6px">${code}</p>
  <p style="margin:0 0 6px;font-size:13px;color:#6b7869">Valable 10 minutes, et il ne sert qu'une fois.</p>
  <p style="margin:0;font-size:13px;color:#6b7869">Si tu n'as rien demandé, ignore ce message : sans le code, personne n'entre.</p>
</div>`.trim(),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[auth] Resend a refusé l'envoi:", res.status, body.slice(0, 300));
      return { sent: false, reason: "upstream" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[auth] l'envoi du code a échoué:", err);
    return { sent: false, reason: "network" };
  }
}
