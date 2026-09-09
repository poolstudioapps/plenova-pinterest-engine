import { ConnectionPanel } from "@/components/pinterest/ConnectionPanel";
import { Card, Notice, SectionHeader } from "@/components/ui";
import { config, isPinterestConfigured, resolveRedirectUri } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { canHostPublicly } from "@/lib/images";
import { getUiLocale } from "@/lib/locale-server";
import { getConnectionStatus } from "@/lib/pinterest";

export const dynamic = "force-dynamic";

export default async function PinterestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getUiLocale();
  const t = translator(locale);

  const params = await searchParams;
  const status = await getConnectionStatus();
  const configured = isPinterestConfigured();
  const redirectUri = resolveRedirectUri();

  const callbackStatus = typeof params.status === "string" ? params.status : null;
  const callbackMessage =
    typeof params.message === "string" ? params.message : null;

  return (
    <>
      <SectionHeader title={t("pinterest.title")} description={t("pinterest.subtitle")} />

      {callbackStatus === "connected" ? (
        <div className="mb-6">
          <Notice tone="info" title={t("pinterest.connectedTitle")}>
            {t("pinterest.connectedBody")}
          </Notice>
        </div>
      ) : null}

      {callbackStatus === "error" && callbackMessage ? (
        <div className="mb-6">
          <Notice tone="danger" title={t("pinterest.failedTitle")}>
            {callbackMessage}
          </Notice>
        </div>
      ) : null}

      {status.mode === "manual" ? (
        <div className="mb-6">
          <Notice tone="warn" title={t("pinterest.trialTitle")}>
            {t("pinterest.trialBody")}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <ConnectionPanel
          uiLocale={locale}
          configured={configured}
          mode={status.mode}
          initialConnected={status.connected}
          account={status.account}
          scopes={status.scopes}
          connectedAt={status.connectedAt}
          expiresAt={status.expiresAt}
          canPublish={status.connected && status.canWrite && canHostPublicly()}
        />

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-[15px] font-semibold">{t("pinterest.config")}</h2>
          <dl className="space-y-3 text-[13px]">
            <div>
              <dt className="text-[var(--color-ink-soft)]">
                {t("pinterest.redirectUri")}
              </dt>
              <dd className="mt-0.5 break-all font-mono text-[12px]">
                {redirectUri ?? "-"}
              </dd>
              <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
                {t("pinterest.redirectHint")}
              </p>
            </div>
            <div>
              <dt className="text-[var(--color-ink-soft)]">{t("pinterest.scopes")}</dt>
              <dd className="mt-0.5 font-mono text-[12px]">
                {config.pinterest.scopes.join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-soft)]">{t("pinterest.apiBase")}</dt>
              <dd className="mt-0.5 break-all font-mono text-[12px]">
                {config.pinterest.apiBase}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-soft)]">
                {t("pinterest.destination")}
              </dt>
              <dd className="mt-0.5 break-all font-mono text-[12px]">
                {config.app.oneLink}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {!configured ? (
        <div className="mt-6">
          <Notice tone="warn" title={t("pinterest.notConfigured")}>
            <code>PINTEREST_APP_ID</code>, <code>PINTEREST_APP_SECRET</code>,{" "}
            <code>PINTEREST_REDIRECT_URI</code>
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
