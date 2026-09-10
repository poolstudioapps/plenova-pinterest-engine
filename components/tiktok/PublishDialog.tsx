"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Notice, Select, Spinner } from "@/components/ui";
import { translator, type Locale } from "@/lib/i18n";
import type { CarouselRecord, TikTokCreatorInfo } from "@/lib/types";

/**
 * Pre-publish dialog.
 *
 * This screen is not cosmetic - TikTok audits it. The privacy options must be
 * rendered from a live creator_info call and the operator's choice honoured, so
 * the list is fetched every time the dialog opens and never cached or
 * hard-coded. The branded-content toggles are required disclosures.
 */
interface Props {
  uiLocale: Locale;
  carousel: CarouselRecord;
  canDirectPost: boolean;
  canDraft: boolean;
  onClose: () => void;
  onPublished: (carousel: CarouselRecord) => void;
}

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

export function PublishDialog({
  uiLocale,
  carousel,
  canDirectPost,
  canDraft,
  onClose,
  onPublished,
}: Props) {
  const t = translator(uiLocale);

  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [postMode, setPostMode] = useState<"DIRECT_POST" | "MEDIA_UPLOAD">(
    canDirectPost ? "DIRECT_POST" : "MEDIA_UPLOAD",
  );
  const [privacy, setPrivacy] = useState("");
  const [brandContent, setBrandContent] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/tiktok/creator-info");
        const data = (await res.json()) as {
          creator?: TikTokCreatorInfo;
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!res.ok || !data.creator) {
          setLoadError(data.error?.message ?? t("preview.requestFailed"));
          return;
        }
        setCreator(data.creator);
        // Default to the first option TikTok actually offers this account.
        setPrivacy(data.creator.privacyOptions[0] ?? "");
      } catch {
        if (!cancelled) setLoadError(t("preview.unreachable"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

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
          postMode,
          privacyLevel: postMode === "DIRECT_POST" ? privacy : undefined,
          brandContentToggle: brandContent,
          brandOrganicToggle: brandOrganic,
        }),
      });
      const data = (await res.json()) as {
        carousel?: CarouselRecord;
        error?: { message?: string } | string | null;
      };

      if (!res.ok) {
        const apiError =
          data.error && typeof data.error === "object" ? data.error.message : null;
        setMessage({ tone: "danger", text: apiError ?? t("preview.requestFailed") });
        if (data.carousel) onPublished(data.carousel);
        return;
      }

      if (data.carousel) {
        onPublished(data.carousel);
        setMessage({
          tone: "info",
          text:
            postMode === "DIRECT_POST"
              ? t("publish.published", { id: data.carousel.publishId ?? "" })
              : t("publish.draftDone"),
        });
      }
    } catch {
      setMessage({ tone: "danger", text: t("preview.unreachable") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto p-5">
        <h2 className="text-[16px] font-semibold">{t("publish.title")}</h2>

        {loadError ? (
          <div className="mt-4">
            <Notice tone="danger">{loadError}</Notice>
          </div>
        ) : !creator ? (
          <div className="flex items-center gap-2 py-8 text-[13px] text-[var(--color-ink-soft)]">
            <Spinner /> {t("publish.loading")}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 rounded-[10px] bg-[var(--color-surface-muted)] p-3">
              {creator.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={creator.avatarUrl}
                  alt=""
                  className="size-9 rounded-full object-cover"
                />
              ) : (
                <div className="size-9 rounded-full bg-[var(--color-line)]" />
              )}
              <p className="text-[13.5px] font-medium">{creator.nickname}</p>
            </div>

            <Field label={t("publish.mode")} htmlFor="mode">
              <Select
                id="mode"
                value={postMode}
                onChange={(e) =>
                  setPostMode(e.target.value as "DIRECT_POST" | "MEDIA_UPLOAD")
                }
              >
                {canDirectPost ? (
                  <option value="DIRECT_POST">{t("publish.modeDirect")}</option>
                ) : null}
                {canDraft ? (
                  <option value="MEDIA_UPLOAD">{t("publish.modeDraft")}</option>
                ) : null}
              </Select>
            </Field>

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

            {message ? (
              <Notice tone={message.tone === "danger" ? "danger" : "info"}>
                {message.text}
              </Notice>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>
                {t("publish.cancel")}
              </Button>
              <Button variant="primary" onClick={publish} loading={busy}>
                {t("publish.confirm")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
