"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { translator } from "@/lib/i18n";

/**
 * Two steps: an address, then proof you can read its mail - the link in it,
 * or the code when the mail carries one.
 *
 * The first step never says whether the address is on the allowlist - the
 * server answers the same either way, and so does this screen. Saying "unknown
 * address" would turn the form into a way of enumerating who has access.
 */
/**
 * Where to go once signed in: a path of this site only. "//other.site" and
 * "/\\other.site" start with a slash too, and a browser follows them off-site.
 */
function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function LoginForm() {
  const t = translator();
  const router = useRouter();
  const params = useSearchParams();
  const codeInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Seconds before another mail may be asked for - Supabase allows one a minute. */
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  /*
   * Arriving from the link in the mail.
   *
   * Supabase puts the access token in the URL fragment, which never reaches
   * the server, so it is read here and handed over once. The fragment is
   * wiped from the address bar first: a token left there would sit in the
   * browser history.
   */
  const [fromLink, setFromLink] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const failure = hash.get("error_description");
    if (!accessToken && !failure) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (failure) {
      setError(failure.replace(/\+/g, " "));
      return;
    }
    setFromLink(true);
    void (async () => {
      try {
        const res = await fetch("/api/auth/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          setError(data.error?.message ?? t("login.badCode"));
          setFromLink(false);
          return;
        }
        const next = params.get("next");
        router.replace(safeNext(next));
        router.refresh();
      } catch {
        setError(t("login.unreachable"));
        setFromLink(false);
      }
    })();
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(data.error?.message ?? t("login.failed"));
        return;
      }
      setStep("code");
      setCooldown(60);
      // The field they are about to use, focused for them.
      window.setTimeout(() => codeInput.current?.focus(), 0);
    } catch {
      setError(t("login.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(data.error?.message ?? t("login.badCode"));
        setCode("");
        return;
      }
      // Only same-origin destinations, so ?next= cannot bounce someone to
      // another site after a successful sign-in.
      const next = params.get("next");
      router.replace(safeNext(next));
      router.refresh();
    } catch {
      setError(t("login.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  if (fromLink) {
    return (
      <Card className="p-6">
        <p className="text-center text-[14px] text-[var(--color-ink-soft)]">
          {t("login.checkingLink")}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <Field label={t("login.email")} htmlFor="email" hint={t("login.emailHint")}>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoFocus
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={busy}
            disabled={email.trim().length < 5}
          >
            {t("login.sendCode")}
          </Button>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <div className="rounded-[12px] bg-[var(--color-accent-soft)] px-4 py-3">
            <p className="text-[14px] font-semibold text-[var(--color-accent-ink)]">
              {t("login.checkMail")}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
              {t("login.checkMailBody", { email })}
            </p>
          </div>
          <Field label={t("login.code")} htmlFor="code" hint={t("login.codeHint")}>
            <Input
              id="code"
              ref={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-[22px] tracking-[0.3em]"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={busy}
            disabled={code.length < 6}
          >
            {t("login.verify")}
          </Button>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex items-center justify-between gap-3 text-[12.5px]">
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={cooldown > 0 || busy}
              className="text-[var(--color-accent)] transition-colors hover:underline disabled:text-[var(--color-ink-faint)] disabled:no-underline"
            >
              {cooldown > 0 ? t("login.resendIn", { s: cooldown }) : t("login.resend")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
            >
              {t("login.changeEmail")}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
