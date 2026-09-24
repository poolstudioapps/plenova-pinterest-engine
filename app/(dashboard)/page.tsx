import Link from "next/link";
import { Plant3D } from "@/components/plants/Plant3D";
import { Badge, ButtonLink, Card, Notice, SectionHeader, StatusBadge } from "@/components/ui";
import { readiness } from "@/lib/config";
import { plantIdentity } from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { translator, type TranslationKey } from "@/lib/i18n";
import { getConnectionStatus } from "@/lib/pinterest";
import { getStore } from "@/lib/store";
import type { CarouselRecord } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CAROUSEL_STATUS: Record<CarouselRecord["status"], TranslationKey> = {
  generating: "status.generating",
  draft: "status.draft",
  publishing: "status.publishing",
  published: "status.published",
  failed: "status.failed",
};

/* The same colours as the Pin statuses: green done, amber moving, red stuck. */
const CAROUSEL_TONE: Record<CarouselRecord["status"], string> = {
  generating: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  draft: "",
  publishing: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  published: "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]",
  failed: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return (
    <div className="rounded-[14px] bg-[var(--color-surface-muted)] px-3.5 py-3">
      <p className="text-[12px] font-medium text-[var(--color-ink-soft)]">{label}</p>
      <p
        className={cn(
          "mt-1 text-[24px] leading-none font-semibold tracking-[-0.03em] tabular-nums",
          tone === "warn" && Number(value) > 0 && "text-[var(--color-danger)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ChannelHeader({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
      <Link
        href={href}
        className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
      >
        {link} →
      </Link>
    </div>
  );
}

/**
 * Where things stand and where to go next.
 *
 * The first dashboard was Pinterest's alone - ten counters, several of them
 * internal (angles in the catalog, pins theoretically possible) - while most
 * of the work now happens in TikTok carousels. It is now one card per
 * channel, each with what needs attention and the latest work, under the two
 * actions that start everything.
 */
export default async function DashboardPage() {
  const t = translator();

  const store = getStore();
  const [pins, media, carousels, accounts, templates, connection] = await Promise.all([
    store.listPins(),
    store.listMedia(),
    store.listCarousels(),
    store.listTikTokAccounts(),
    store.listSlideTemplates(),
    getConnectionStatus(),
  ]);
  const report = readiness();

  const pinCount = (s: string) => pins.filter((p) => p.status === s).length;
  const carouselCount = (s: CarouselRecord["status"]) =>
    carousels.filter((c) => c.status === s).length;
  const reuses = media.reduce((n, a) => n + Math.max(0, a.usedCount - 1), 0);

  return (
    <>
      <SectionHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
        action={
          <Plant3D className="-my-8 hidden h-[190px] w-[230px] shrink-0 md:block" floating={4} />
        }
      />

      <div className="mb-6 flex flex-wrap gap-2.5">
        <ButtonLink href="/carousels" variant="primary">
          {t("dashboard.newCarousel")}
        </ButtonLink>
        <ButtonLink href="/generate">{t("dashboard.newPins")}</ButtonLink>
        <ButtonLink href="/media" variant="ghost">
          {t("dashboard.openLibrary")}
        </ButtonLink>
      </div>

      {report.warnings.length > 0 ? (
        <div className="mb-6 space-y-2.5">
          {report.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
        </div>
      ) : null}

      {!store.persistent ? (
        <div className="mb-6">
          <Notice tone="danger" title={t("dashboard.notPersistentTitle")}>
            {t("dashboard.notPersistent")}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------ TikTok */}
        <Card className="p-5">
          <ChannelHeader title="TikTok" href="/carousels" link={t("dashboard.allCarousels")} />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label={t("dashboard.cDraft")} value={carouselCount("draft")} />
            <Stat label={t("dashboard.cPublished")} value={carouselCount("published")} />
            <Stat
              label={t("dashboard.cInFlight")}
              value={carouselCount("generating") + carouselCount("publishing")}
            />
            <Stat label={t("dashboard.cFailed")} value={carouselCount("failed")} tone="warn" />
          </div>

          <p className="mt-4 text-[12.5px] text-[var(--color-ink-soft)]">
            {accounts.length === 0 ? (
              <>
                {t("dashboard.noAccounts")}{" "}
                <Link href="/tiktok" className="font-medium text-[var(--color-accent)] hover:underline">
                  {t("dashboard.connectAccount")}
                </Link>
              </>
            ) : (
              t("dashboard.accounts", {
                list: accounts
                  .map((a) => `@${a.username || a.displayName} (${a.language.toUpperCase()})`)
                  .join(", "),
              })
            )}
          </p>

          <div className="mt-4 border-t border-[var(--color-line)] pt-3">
            {carousels.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-[var(--color-ink-soft)]">
                {t("dashboard.noCarousels")}{" "}
                <Link href="/carousels" className="font-medium text-[var(--color-accent)] hover:underline">
                  {t("dashboard.firstCarousel")}
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {carousels.slice(0, 4).map((c) => {
                  const lang = c.languages[0] ?? "fr";
                  const cover = c.slides[c.coverIndex - 1] ?? c.slides[0];
                  const thumb = cover?.composed[lang] ?? cover?.imageUrl ?? null;
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-12 w-[38px] shrink-0 rounded-[7px] object-cover"
                        />
                      ) : (
                        <div className="h-12 w-[38px] shrink-0 rounded-[7px] bg-[var(--color-surface-muted)]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">
                          {c.slides[0]?.text[lang]?.title || c.theme}
                        </p>
                        <p className="truncate text-[12px] text-[var(--color-ink-faint)]">
                          {t("carousels.slides", { n: c.slides.length })} ·{" "}
                          {c.languages.join(" ").toUpperCase()} · {relativeTime(c.createdAt)}
                        </p>
                      </div>
                      <Badge className={CAROUSEL_TONE[c.status]}>{t(CAROUSEL_STATUS[c.status])}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {/* --------------------------------------------------- Pinterest */}
        <Card className="p-5">
          <ChannelHeader title="Pinterest" href="/library" link={t("dashboard.allPins")} />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label={t("dashboard.generated")} value={pins.length} />
            <Stat label={t("dashboard.published")} value={pinCount("published")} />
            <Stat
              label={t("dashboard.queued")}
              value={pinCount("queued") + pinCount("scheduled")}
            />
            <Stat label={t("dashboard.failed")} value={pinCount("failed")} tone="warn" />
          </div>

          <p className="mt-4 text-[12.5px] text-[var(--color-ink-soft)]">
            {connection.connected ? (
              t("dashboard.pinterestConnected")
            ) : (
              <>
                {t("dashboard.pinterestNotConnected")}{" "}
                <Link href="/pinterest" className="font-medium text-[var(--color-accent)] hover:underline">
                  {t("dashboard.connectAccount")}
                </Link>
              </>
            )}
          </p>

          <div className="mt-4 border-t border-[var(--color-line)] pt-3">
            {pins.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-[var(--color-ink-soft)]">
                {t("dashboard.empty")}{" "}
                <Link href="/generate" className="font-medium text-[var(--color-accent)] hover:underline">
                  {t("dashboard.emptyCta")}
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {pins.slice(0, 4).map((pin) => (
                  <li key={pin.id} className="flex items-center gap-3 py-2.5">
                    {pin.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pin.imageUrl}
                        alt=""
                        className="h-12 w-8 shrink-0 rounded-[7px] object-cover"
                      />
                    ) : (
                      <div className="h-12 w-8 shrink-0 rounded-[7px] bg-[var(--color-surface-muted)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{pin.title}</p>
                      <p className="truncate text-[12px] text-[var(--color-ink-faint)]">
                        {plantIdentity({
                          slug: pin.plantSlug,
                          fallbackName: pin.plantName,
                          variety: pin.variety,
                        }).label}{" "}
                        · {pin.locale.toUpperCase()} · {relativeTime(pin.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={pin.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* ----------------------------------------------------- library */}
        <Card className="p-5 lg:col-span-2">
          <ChannelHeader title={t("dashboard.library")} href="/media" link={t("dashboard.openLibrary")} />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label={t("dashboard.media")} value={media.length} />
            <Stat label={t("dashboard.templates")} value={templates.length} />
            <Stat label={t("dashboard.reuses")} value={reuses} />
            <Stat label={t("dashboard.plants")} value={PLANTS.length} />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
            {t("dashboard.libraryHint")}
          </p>
        </Card>

        {/* ------------------------------------------------------ system */}
        <Card className="p-5">
          <h2 className="mb-4 text-[16px] font-semibold tracking-[-0.01em]">{t("dashboard.system")}</h2>
          <dl className="space-y-3 text-[13px]">
            {[
              { label: t("dashboard.gemini"), ready: report.gemini },
              { label: t("dashboard.tiktokAccounts"), ready: accounts.length > 0 },
              { label: t("dashboard.pinterestApp"), ready: report.pinterest },
              { label: t("dashboard.hosting"), ready: report.blobStorage },
              { label: t("dashboard.encryption"), ready: report.encryptionKey },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-ink-soft)]">{row.label}</dt>
                <dd className="flex shrink-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{
                      backgroundColor: row.ready ? "var(--color-accent)" : "var(--color-ink-faint)",
                    }}
                  />
                  <span className="font-medium">
                    {row.ready ? t("dashboard.ready") : t("dashboard.notSet")}
                  </span>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3">
              <dt className="text-[var(--color-ink-soft)]">{t("dashboard.storage")}</dt>
              <dd className="text-right font-medium">{store.name}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
