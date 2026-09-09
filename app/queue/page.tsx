import {
  Badge,
  Card,
  EmptyState,
  Notice,
  SectionHeader,
  StatusBadge,
} from "@/components/ui";
import { config } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { getUiLocale } from "@/lib/locale-server";
import { getStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const locale = await getUiLocale();
  const t = translator(locale);

  const pins = await getStore().listPins();
  const queued = pins.filter((p) =>
    ["queued", "scheduled", "publishing", "failed"].includes(p.status),
  );

  return (
    <>
      <SectionHeader title={t("queue.title")} description={t("queue.subtitle")} />

      {!config.security.cronSecret ? (
        <div className="mb-6">
          <Notice tone="warn" title={t("queue.noCronTitle")}>
            {t("queue.noCron")}
          </Notice>
        </div>
      ) : null}

      {queued.length === 0 ? (
        <EmptyState title={t("queue.empty")} description={t("queue.emptyBody")} />
      ) : (
        <Card className="divide-y divide-[var(--color-line)]">
          {queued.map((pin) => (
            <div key={pin.id} className="flex items-center gap-4 p-4">
              {pin.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pin.imageUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-[9px] object-cover"
                />
              ) : (
                <div className="size-14 shrink-0 rounded-[9px] bg-[var(--color-surface-muted)]" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{pin.title}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-ink-faint)]">
                  {pin.boardName
                    ? `${t("queue.board")}: ${pin.boardName}`
                    : t("queue.noBoard")}
                  {pin.scheduledAt ? ` · ${formatDate(pin.scheduledAt)}` : ""}
                  {pin.attempts > 0
                    ? ` · ${pin.attempts} ${t("queue.attempts")}`
                    : ""}
                </p>
                {pin.error ? (
                  <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-danger)]">
                    {pin.error}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge status={pin.status} />
                <Badge>{pin.plantName}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
