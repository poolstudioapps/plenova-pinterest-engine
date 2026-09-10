"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  Select,
  Spinner,
} from "@/components/ui";
import type { AccountView } from "@/components/tiktok/TikTokPanel";
import { CONTENT_LOCALE_LABELS, translator, type Locale } from "@/lib/i18n";
import type {
  CarouselPost,
  CarouselRecord,
  TikTokCreatorInfo,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  carousel: CarouselRecord;
  accounts: AccountView[];
  onClose: () => void;
  onPublished: (carousel: CarouselRecord) => void;
}

const POST_MODE_KEY = "plenova_post_mode";

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

/**
 * Pre-publish dialog for a multipost.
 *
 * TikTok audits this screen: the privacy options must come from a live
 * creator_info call and the choice must be honoured. Options can differ per
 * account, so they are fetched for the first selected account and applied to
 * the run.
 *
 * Only accounts whose language the carousel was actually written in can be
 * selected. Posting an empty caption would be worse than not posting.
 */
export function PublishDialog({
  uiLocale,
  carousel,
  accounts,
  onClose,
  onPublished,
}: Props) {
  const t = translator(uiLocale);

  const eligible = accounts.filter((a) =>
    carousel.languages.includes(a.language),
  );
  const ineligible = accounts.filter(
    (a) => !carousel.languages.includes(a.language),
  );

  const [selected, setSelected] = useState<string[]>(
    eligible.map((a) => a.openId),
  );
  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Remembered between sessions: an operator who works in drafts works in
  // drafts every time, and re-picking it on every publish is friction.
  const [postMode, setPostMode] = useState<"DIRECT_POST" | "MEDIA_UPLOAD">(() => {
    try {
      const saved = localStorage.getItem(POST_MODE_KEY);
      return saved === "MEDIA_UPLOAD" ? "MEDIA_UPLOAD" : "DIRECT_POST";
    } catch {
      // Private windows and blocked storage both throw; the default is fine.
      return "DIRECT_POST";
    }
  });
  const [privacy, setPrivacy] = useState("");
  const [brandContent, setBrandContent] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CarouselPost[] | null>(null);
  const [message, setMessage] = useState<{
    tone: "info" | "danger";
    text: string;
  } | null>(null);

  const first = selected[0];

  useEffect(() => {
    if (!first) return;
    let cancelled = false;
    setCreator(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/tiktok/creator-info?openId=${encodeURIComponent(first)}`,
        );
        const data = (await res.json()) as {
          creator?: TikTokCreatorInfo;
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!res.ok || !data.creator) {
          setLoadError(data.error?.message ?? t("preview.requestFailed"));
          return;
        }
        setLoadError(null);
        setCreator(data.creator);
        setPrivacy(data.creator.privacyOptions[0] ?? "");
      } catch {
        if (!cancelled) setLoadError(t("preview.unreachable"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [first, t]);

  function toggle(openId: string) {
    setSelected((current) =>
      current.includes(openId)
        ? current.filter((x) => x !== openId)
        : [...current, openId],
    );
  }

  async function publish() {
    if (postMode === "DIRECT_POST" && !privacy) {
      setMessage({ tone: "danger", text: t("publish.needPrivacy") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tiktok/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carouselId: carousel.id,
          openIds: selected,
          postMode,
          privacyLevel: postMode === "DIRECT_POST" ? privacy : undefined,
          brandContentToggle: brandContent,
          brandOrganicToggle: brandOrganic,
        }),
      });
      const data = (await res.json()) as {
        carousel?: CarouselRecord;
        posts?: CarouselPost[];
        publishedCount?: number;
        failedCount?: number;
        error?: { message?: string };
      };

      if (data.carousel) onPublished(data.carousel);
      if (data.posts) setResults(data.posts);

      if (!res.ok && !data.posts) {
        setMessage({
          tone: "danger",
          text: data.error?.message ?? t("preview.requestFailed"),
        });
        return;
      }

      setMessage({
        tone: (data.failedCount ?? 0) > 0 ? "danger" : "info",
        text: t("publish.multiResult", {
          ok: data.publishedCount ?? 0,
          ko: data.failedCount ?? 0,
        }),
      });
    } catch {
      setMessage({ tone: "danger", text: t("preview.unreachable") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <h2 className="text-[16px] font-semibold">{t("publish.title")}</h2>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-[13px] font-medium">
              {t("publish.accounts")}{" "}
              <span className="font-normal text-[var(--color-ink-faint)]">
                — {t("publish.selected", { n: selected.length })}
              </span>
            </p>

            {eligible.length === 0 ? (
              <Notice tone="warn">{t("publish.noEligible")}</Notice>
            ) : (
              <div className="space-y-1.5">
                {eligible.map((account) => {
                  const on = selected.includes(account.openId);
                  const done = results?.find((p) => p.openId === account.openId);
                  return (
                    <button
                      key={account.openId}
                      type="button"
                      onClick={() => toggle(account.openId)}
                      aria-pressed={on}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
                        on
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]",
                      )}
                    >
                      {account.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={account.avatarUrl}
                          alt=""
                          className="size-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="size-7 rounded-full bg-[var(--color-line)]" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        @{account.username || account.displayName}
                      </span>
                      <Badge>{CONTENT_LOCALE_LABELS[account.language]}</Badge>
                      {done ? (
                        <Badge
                          className={
                            done.publishId
                              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
                              : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                          }
                        >
                          {done.publishId ? "OK" : "KO"}
                        </Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {ineligible.length > 0 ? (
              <p className="mt-2 text-[12px] text-[var(--color-ink-faint)]">
                {t("publish.skipped", {
                  names: ineligible.map((a) => `@${a.username}`).join(", "),
                })}
              </p>
            ) : null}
          </div>

          {loadError ? (
            <Notice tone="danger">{loadError}</Notice>
          ) : !creator && first ? (
            <div className="flex items-center gap-2 py-4 text-[13px] text-[var(--color-ink-soft)]">
              <Spinner /> {t("publish.loading")}
            </div>
          ) : creator ? (
            <>
              <div>
                <p className="mb-1.5 text-[13px] font-medium">
                  {t("publish.mode")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "DIRECT_POST" as const,
                        label: t("publish.modeDirect"),
                        hint: t("publish.modeDirectHint"),
                      },
                      {
                        value: "MEDIA_UPLOAD" as const,
                        label: t("publish.modeDraft"),
                        hint: t("publish.modeDraftHint"),
                      },
                    ]
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setPostMode(option.value);
                        try {
                          localStorage.setItem(POST_MODE_KEY, option.value);
                        } catch {
                          // Remembering is a convenience, never a requirement.
                        }
                      }}
                      aria-pressed={postMode === option.value}
                      className={cn(
                        "rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                        postMode === option.value
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]",
                      )}
                    >
                      <span className="block text-[13px] font-medium">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {postMode === "DIRECT_POST" ? (
                <>
                  <Field
                    label={t("publish.privacy")}
                    htmlFor="privacy"
                    hint={t("publish.privacyHint")}
                  >
                    <Select
                      id="privacy"
                      value={privacy}
                      onChange={(e) => setPrivacy(e.target.value)}
                    >
                      <option value="">—</option>
                      {creator.privacyOptions.map((option) => (
                        <option key={option} value={option}>
                          {PRIVACY_LABELS[option] ?? option}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <div className="space-y-2.5">
                    <label className="flex items-start gap-2.5 text-[13px] text-[var(--color-ink-soft)]">
                      <input
                        type="checkbox"
                        checked={brandContent}
                        onChange={(e) => setBrandContent(e.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--color-accent)]"
                      />
                      <span>{t("publish.brandContent")}</span>
                    </label>
                    <label className="flex items-start gap-2.5 text-[13px] text-[var(--color-ink-soft)]">
                      <input
                        type="checkbox"
                        checked={brandOrganic}
                        onChange={(e) => setBrandOrganic(e.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--color-accent)]"
                      />
                      <span>{t("publish.brandOrganic")}</span>
                    </label>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {results?.some((p) => p.error) ? (
            <Notice tone="danger" title={t("publish.someFailed")}>
              <ul className="mt-1 space-y-0.5">
                {results
                  .filter((p) => p.error)
                  .map((p) => (
                    <li key={p.openId}>
                      @{p.username}: {p.error}
                    </li>
                  ))}
              </ul>
            </Notice>
          ) : null}

          {message ? (
            <Notice tone={message.tone === "danger" ? "danger" : "info"}>
              {message.text}
            </Notice>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              {t("publish.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={publish}
              loading={busy}
              disabled={selected.length === 0}
            >
              {t("publish.confirmMulti", { n: selected.length })}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
