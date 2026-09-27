import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Circle,
  Gear,
  Images,
  PinterestLogo,
  Plus,
  Sparkle,
  TiktokLogo,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
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

/*
 * Four counters as one strip ruled by hairlines, not four tinted boxes: the
 * numbers are what matter, and a box around each one was louder than they
 * were. The rules are the strip's own background showing through a 1px gap,
 * so they stay right whether it lays out as a row or two by two.
 */
function Stats({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[var(--color-edge)] bg-[var(--color-edge)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  const alarm = tone === "warn" && Number(value) > 0;
  return (
    <div className="bg-[var(--color-canvas)] px-3.5 pt-3 pb-3.5">
      <p className="truncate text-[12px] font-medium text-[var(--color-ink-faint)]">{label}</p>
      <p
        className={cn(
          "figures mt-1.5 text-[26px] leading-none font-semibold tracking-[-0.03em]",
          alarm && "text-[var(--color-danger)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* A link that says where it goes: the arrow leans in under the pointer. */
function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-1 rounded-full text-[13px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-ink)]"
    >
      {children}
      <ArrowRight
        aria-hidden
        size={14}
        weight="bold"
        className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function ChannelHeader({
  title,
  icon: Glyph,
  href,
  link,
}: {
  title: string;
  icon: Icon;
  href?: string;
  link?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.01em]">
        <span className="grid size-8 place-items-center rounded-[10px] bg-[var(--color-surface-muted)] text-[var(--color-accent-ink)]">
          <Glyph aria-hidden size={17} weight="duotone" />
        </span>
        {title}
      </h2>
      {href && link ? <GoLink href={href}>{link}</GoLink> : null}
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
          <Plant3D className="-my-10 hidden h-[200px] w-[240px] shrink-0 md:block" floating={4} />
        }
      />

      <div className="mb-7 flex flex-wrap gap-2.5">
        <ButtonLink href="/carousels" variant="primary">
          <Plus aria-hidden size={16} weight="bold" />
          {t("dashboard.newCarousel")}
        </ButtonLink>
        <ButtonLink href="/generate">
          <Sparkle aria-hidden size={16} weight="duotone" className="text-[var(--color-accent)]" />
          {t("dashboard.newPins")}
        </ButtonLink>
        <ButtonLink href="/media" variant="ghost">
          <Images aria-hidden size={16} />
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------ TikTok */}
        <Card className="p-5">
          <ChannelHeader title="TikTok" icon={TiktokLogo} href="/carousels" link={t("dashboard.allCarousels")} />
          <Stats className="sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <Stat label={t("dashboard.cDraft")} value={carouselCount("draft")} />
            <Stat label={t("dashboard.cPublished")} value={carouselCount("published")} />
            <Stat
              label={t("dashboard.cInFlight")}
              value={carouselCount("generating") + carouselCount("publishing")}
            />
            <Stat label={t("dashboard.cFailed")} value={carouselCount("failed")} tone="warn" />
          </Stats>

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
                          className="h-12 w-[38px] shrink-0 rounded-[8px] object-cover ring-1 ring-[var(--color-edge)]"
                        />
                      ) : (
                        <div className="h-12 w-[38px] shrink-0 rounded-[8px] bg-[var(--color-surface-muted)] ring-1 ring-[var(--color-edge)]" />
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
          <ChannelHeader title="Pinterest" icon={PinterestLogo} href="/library" link={t("dashboard.allPins")} />
          <Stats className="sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <Stat label={t("dashboard.generated")} value={pins.length} />
            <Stat label={t("dashboard.published")} value={pinCount("published")} />
            <Stat
              label={t("dashboard.queued")}
              value={pinCount("queued") + pinCount("scheduled")}
            />
            <Stat label={t("dashboard.failed")} value={pinCount("failed")} tone="warn" />
          </Stats>

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
                        className="h-12 w-8 shrink-0 rounded-[8px] object-cover ring-1 ring-[var(--color-edge)]"
                      />
                    ) : (
                      <div className="h-12 w-8 shrink-0 rounded-[8px] bg-[var(--color-surface-muted)] ring-1 ring-[var(--color-edge)]" />
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

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ----------------------------------------------------- library */}
        <Card className="p-5 lg:col-span-2">
          <ChannelHeader title={t("dashboard.library")} icon={Images} href="/media" link={t("dashboard.openLibrary")} />
          <Stats className="sm:grid-cols-4">
            <Stat label={t("dashboard.media")} value={media.length} />
            <Stat label={t("dashboard.templates")} value={templates.length} />
            <Stat label={t("dashboard.reuses")} value={reuses} />
            <Stat label={t("dashboard.plants")} value={PLANTS.length} />
          </Stats>
          <p className="mt-3.5 max-w-[70ch] text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
            {t("dashboard.libraryHint")}
          </p>
        </Card>

        {/* ------------------------------------------------------ system */}
        <Card className="p-5">
          <ChannelHeader title={t("dashboard.system")} icon={Gear} />
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
                {/* A tick or an empty ring as well as the word: ready is
                    readable at a glance down the column. */}
                <dd
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 font-medium",
                    row.ready ? "text-[var(--color-accent-ink)]" : "text-[var(--color-ink-faint)]",
                  )}
                >
                  {row.ready ? (
                    <CheckCircle aria-hidden size={16} weight="fill" className="text-[var(--color-accent)]" />
                  ) : (
                    <Circle aria-hidden size={16} />
                  )}
                  {row.ready ? t("dashboard.ready") : t("dashboard.notSet")}
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
