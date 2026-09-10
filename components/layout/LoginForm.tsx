"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export function LoginForm({
  label,
  cta,
  failed,
  unreachable,
}: {
  label: string;
  cta: string;
  failed: string;
  unreachable: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(failed);
        return;
      }
      // Only allow same-origin destinations, so ?next= cannot be used to
      // bounce someone to another site after a successful sign-in.
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError(unreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <Field label={label} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {cta}
        </Button>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </form>
    </Card>
  );
}
