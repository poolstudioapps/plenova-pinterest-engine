import Link from "next/link";
import { Badge, Card, Notice, SectionHeader } from "@/components/ui";
import { readiness } from "@/lib/config";
import { ANGLES } from "@/lib/data/angles";
import { PLANTS } from "@/lib/data/plants";
import { translator } from "@/lib/i18n";
import { getUiLocale } from "@/lib/locale-server";
import { getConnectionStatus } from "@/lib/pinterest";
import { getStore } from "@/lib/store";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VARIATIONS_PER_SLOT = 4;

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-1.5 text-[28px] font-semibold tracking-[-0.03em] tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[12px] text-[var(--color-ink-faint)]">{hint}</p>
      ) : null}
    </Card>
  );
}

export default async function DashboardPage() {
  const locale = await getUiLocale();
  const t = translator(locale);

  const store = getStore();
  const [pins, media, connection] = await Promise.all([
    store.listPins(),
    store.listMedia(),
    getConnectionStatus(),
  ]);
  const report = readiness();

  const count = (s: string) => pins.filter((p) => p.status === s).length;
  const recent = pins.slice(0, 5);
  const capacity = PLANTS.length * ANGLES.length * VARIATIONS_PER_SLOT;

  return (
    <>
      <SectionHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("dashboard.plants")}
          value={PLANTS.length}
          hint={t("dashboard.plantsHint")}
        />
        <Stat
          label={t("dashboard.angles")}
          value={ANGLES.length}
          hint={t("dashboard.anglesHint")}
        />
        <Stat
          label={t("dashboard.possible")}
          value={capacity.toLocaleString(locale)}
          hint={t("dashboard.possibleHint")}
        />
        <Stat
          label={t("dashboard.generated")}
          value={pins.length}
          hint={t("dashboard.generatedHint")}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("dashboard.published")} value={count("published")} />
        <Stat label={t("dashboard.queued")} value={count("queued")} />
        <Stat label={t("dashboard.scheduled")} value={count("scheduled")} />
        <Stat label={t("dashboard.failed")} value={count("failed")} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat
          label={t("dashboard.media")}
          value={media.length}
          hint={t("dashboard.mediaHint")}
        />
        <Stat
          label={t("dashboard.reuses")}
          value={media.reduce((n, a) => n + Math.max(0, a.usedCount - 1), 0)}
          hint={t("dashboard.reusesHint")}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">{t("dashboard.recent")}</h2>
            <Link
              href="/library"
              className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
            >
              {t("dashboard.viewLibrary")}
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-[var(--color-ink-soft)]">
              {t("dashboard.empty")}{" "}
              <Link
                href="/generate"
                className="font-medium text-[var(--color-accent)] hover:underline"
              >
                {t("dashboard.emptyCta")}
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {recent.map((pin) => (
                <li key={pin.id} className="flex items-center gap-3 py-3">
                  {pin.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pin.imageUrl}
                      alt=""
                      className="size-11 shrink-0 rounded-[8px] object-cover"
                    />
                  ) : (
                    <div className="size-11 shrink-0 rounded-[8px] bg-[var(--color-surface-muted)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{pin.title}</p>
                    <p className="truncate text-[12px] text-[var(--color-ink-faint)]">
                      {pin.plantName} · {pin.angleLabel} ·{" "}
                      {relativeTime(pin.createdAt)}
                    </p>
                  </div>
                  <Badge className="uppercase">{pin.locale}</Badge>
                  <Badge>{pin.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">{t("dashboard.system")}</h2>
          <dl className="space-y-3 text-[13px]">
            {[
              { label: t("dashboard.gemini"), ready: report.gemini },
              { label: t("dashboard.pinterestApp"), ready: report.pinterest },
              { label: t("dashboard.connected"), ready: connection.connected },
              { label: t("dashboard.hosting"), ready: report.blobStorage },
              { label: t("dashboard.encryption"), ready: report.encryptionKey },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <dt className="text-[var(--color-ink-soft)]">{row.label}</dt>
                <dd className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{
                      backgroundColor: row.ready
                        ? "var(--color-accent)"
                        : "var(--color-ink-faint)",
                    }}
                  />
                  <span className="font-medium">
                    {row.ready ? t("dashboard.ready") : t("dashboard.notSet")}
                  </span>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-3">
              <dt className="text-[var(--color-ink-soft)]">{t("dashboard.storage")}</dt>
              <dd className="text-right font-medium">{store.name}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
