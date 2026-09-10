import { TikTokPanel } from "@/components/tiktok/TikTokPanel";
import { Card, Notice, SectionHeader } from "@/components/ui";
import { config, isTikTokConfigured, resolveTikTokRedirectUri } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { canHostPublicly } from "@/lib/images";
import { getUiLocale } from "@/lib/locale-server";
import { getStatus } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export default async function TikTokPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getUiLocale();
  const t = translator(locale);

  const params = await searchParams;
  const status = await getStatus();
  const callbackStatus = typeof params.status === "string" ? params.status : null;
  const callbackMessage =
    typeof params.message === "string" ? params.message : null;

  return (
    <>
      <SectionHeader title={t("tiktok.title")} description={t("tiktok.subtitle")} />

      {callbackStatus === "connected" ? (
        <div className="mb-6">
          <Notice tone="info" title={t("tiktok.connectedTitle")}>
            {t("tiktok.connectedBody")}
          </Notice>
        </div>
      ) : null}

      {callbackStatus === "error" && callbackMessage ? (
        <div className="mb-6">
          <Notice tone="danger" title={t("tiktok.failedTitle")}>
            {callbackMessage}
          </Notice>
        </div>
      ) : null}

      {/*
        * Shown whenever the account is not connected: an unapproved app sits in
        * Development Mode, where TikTok rejects any account that is not a
        * registered Test User - with a bare "client_key" error that points at
        * the wrong thing entirely.
        */}
      {status.accounts.length === 0 && isTikTokConfigured() ? (
        <div className="mb-6">
          <Notice tone="warn" title={t("tiktok.devMode")}>
            {t("tiktok.devModeBody")}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <TikTokPanel
          uiLocale={locale}
          configured={status.configured}
          accounts={status.accounts}
        />

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-[15px] font-semibold">{t("tiktok.config")}</h2>
          <dl className="space-y-3 text-[13px]">
            <div>
              <dt className="text-[var(--color-ink-soft)]">
                {t("tiktok.redirectUri")}
              </dt>
              <dd className="mt-0.5 break-all font-mono text-[12px]">
                {resolveTikTokRedirectUri() ?? "-"}
              </dd>
              <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
                {t("tiktok.redirectHint")}
              </p>
            </div>
            <div>
              <dt className="text-[var(--color-ink-soft)]">{t("tiktok.clientKey")}</dt>
              <dd className="mt-0.5 font-mono text-[12px]">
                {config.tiktok.clientKey
                  ? `••••${config.tiktok.clientKey.slice(-4)}`
                  : t("tiktok.clientKeyMissing")}
              </dd>
              <dd className="mt-0.5 font-mono text-[12px]">
                {t("tiktok.secret")}:{" "}
                {config.tiktok.clientSecret ? "••••••" : t("tiktok.clientKeyMissing")}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-soft)]">{t("tiktok.scopes")}</dt>
              <dd className="mt-0.5 font-mono text-[12px]">
                {config.tiktok.scopes.join(", ")}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {!isTikTokConfigured() ? (
        <div className="mt-6">
          <Notice tone="warn" title={t("tiktok.notConfigured")}>
            {t("tiktok.notConfiguredBody")}
          </Notice>
        </div>
      ) : null}

      {!canHostPublicly() ? (
        <div className="mt-4">
          <Notice tone="warn" title={t("pinterest.noHostingTitle")}>
            {t("pinterest.noHosting")}
          </Notice>
        </div>
      ) : null}
    </>
  );
}
