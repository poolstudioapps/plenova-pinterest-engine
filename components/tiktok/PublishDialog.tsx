"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Field, Notice, Select, Spinner } from "@/components/ui";
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

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

/** Branded content may not be private, so these two are the only ones left. */
const PUBLIC_ENOUGH = new Set(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS"]);

/** A handle when there is one, something legible when there is not. */
function label(account: AccountView, creator?: TikTokCreatorInfo): string {
  if (creator?.nickname) return creator.nickname;
  if (account.username) return `@${account.username}`;
  return account.displayName || account.openId.slice(-6);
}

/**
 * Pre-publish screen for a multipost.
 *
 * TikTok audits this screen, and its guidelines are specific about it: the
 * creator's own details have to be shown, the privacy options have to come
 * from a live creator_info call with nothing preselected, the interaction and
 * disclosure toggles start off, branded content cannot be private, and the
 * declaration above the button changes with what was disclosed.
 *
 * Creator info is fetched per selected account rather than once, because the
 * options are per account; only what every selected account allows is offered.
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
  const [creators, setCreators] = useState<Record<string, TikTokCreatorInfo>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [privacy, setPrivacy] = useState("");
  // Every one of these starts off, which is what the guidelines require.
  const [discloses, setDiscloses] = useState(false);
  const [brandContent, setBrandContent] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [allowComment, setAllowComment] = useState(false);
  // The slides genuinely are model-generated, so this one starts on.
  const [isAigc, setIsAigc] = useState(true);

  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CarouselPost[] | null>(null);
  const [message, setMessage] = useState<{
    tone: "info" | "danger";
    text: string;
  } | null>(null);

  const key = selected.join(",");
  /**
   * Accounts already asked about, so re-rendering or adding one more account
   * cannot re-ask for the ones already answered. TikTok's creator-info
   * endpoint has its own budget, and spending it is what produces a rate limit
   * that looks like publishing being blocked.
   */
  const asked = useRef<Set<string>>(new Set());

  // One call per selected account: the options are per account, and applying
  // the first account's answer to the rest would be a guess.
  useEffect(() => {
    if (key === "") {
      setCreators({});
      return;
    }
    const ids = key.split(",").filter((id) => !asked.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) asked.current.add(id);

    let cancelled = false;
    setLoading(true);
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (openId) => {
          try {
            const res = await fetch(
              `/api/tiktok/creator-info?openId=${encodeURIComponent(openId)}`,
            );
            const data = (await res.json()) as {
              creator?: TikTokCreatorInfo;
              error?: { message?: string };
            };
            if (!res.ok || !data.creator) {
              return { openId, error: data.error?.message ?? null };
            }
            return { openId, creator: data.creator };
          } catch {
            return { openId, error: t("preview.unreachable") };
          }
        }),
      );
      if (cancelled) return;

      const found: Record<string, TikTokCreatorInfo> = {};
      let firstError: string | null = null;
      for (const entry of entries) {
        if (entry.creator) found[entry.openId] = entry.creator;
        else firstError ??= entry.error ?? t("preview.requestFailed");
      }
      setCreators((current) => ({ ...current, ...found }));
      setLoadError(firstError);
      setLoading(false);
      // Nothing is preselected: TikTok requires the operator to pick.
      setPrivacy("");
    })();
    return () => {
      cancelled = true;
    };
  }, [key, attempt, t]);

  /** Only what every selected account allows. */
  const privacyOptions = useMemo(() => {
    const lists = selected
      .map((id) => creators[id]?.privacyOptions)
      .filter((o): o is string[] => Array.isArray(o));
    if (lists.length === 0) return [];
    return lists.reduce((shared, list) =>
      shared.filter((option) => list.includes(option)),
    );
  }, [creators, selected]);

  /** If any selected account has comments off, the option cannot be offered. */
  const commentDisabled = selected.some((id) => creators[id]?.commentDisabled);
  const ready = selected.length > 0 && privacyOptions.length > 0;

  // Branded content cannot be private, so a private choice is cleared the
  // moment it is disclosed, and the private options are disabled below.
  useEffect(() => {
    if (brandContent && privacy && !PUBLIC_ENOUGH.has(privacy)) setPrivacy("");
  }, [brandContent, privacy]);

  const disclosureIncomplete = discloses && !brandContent && !brandOrganic;

  function toggle(openId: string) {
    setSelected((current) =>
      current.includes(openId)
        ? current.filter((x) => x !== openId)
        : [...current, openId],
    );
  }

  async function publish(postMode: "DIRECT_POST" | "MEDIA_UPLOAD") {
    if (postMode === "DIRECT_POST" && !privacy) {
      setMessage({ tone: "danger", text: t("publish.needPrivacy") });
      return;
    }
    if (disclosureIncomplete) {
      setMessage({ tone: "danger", text: t("publish.disclosureNeeded") });
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
          brandContentToggle: discloses && brandContent,
          brandOrganicToggle: discloses && brandOrganic,
          allowComment: allowComment && !commentDisabled,
          isAigc,
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

  const consent =
    discloses && brandContent ? t("publish.consentBranded") : t("publish.consent");

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
                  const creator = creators[account.openId];
                  const done = results?.find((p) => p.openId === account.openId);
                  const avatar = creator?.avatarUrl ?? account.avatarUrl;
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
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar}
                          alt=""
                          className="size-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="size-7 rounded-full bg-[var(--color-line)]" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {label(account, creator)}
                      </span>
                      <Badge>{CONTENT_LOCALE_LABELS[account.language]}</Badge>
                      {done ? (
                        <Badge
                          className={
                            done.settled === "published"
                              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
                              : done.settled === "pending"
                                ? "bg-[var(--color-line)]"
                                : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                          }
                        >
                          {done.settled === "published"
                            ? "OK"
                            : done.settled === "pending"
                              ? "..."
                              : "KO"}
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
                  names: ineligible.map((a) => label(a)).join(", "),
                })}
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-[13px] text-[var(--color-ink-soft)]">
              <Spinner /> {t("publish.loading")}
            </div>
          ) : null}

          {loadError ? (
            <Notice tone="warn" title={t("publish.creatorUnavailable")}>
              <p className="mt-1">{loadError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null);
                  asked.current.clear();
                  setAttempt((n) => n + 1);
                }}
                className="mt-2 rounded-[8px] border border-[var(--color-line)] px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-[var(--color-accent)]"
              >
                {t("publish.retry")}
              </button>
            </Notice>
          ) : null}

          {ready ? (
            <>
              <Field
                label={t("publish.privacy")}
                htmlFor="privacy"
                hint={
                  selected.length > 1
                    ? t("publish.perAccount")
                    : t("publish.privacyHint")
                }
              >
                <Select
                  id="privacy"
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value)}
                >
                  <option value="">—</option>
                  {privacyOptions.map((option) => {
                    const blocked = brandContent && !PUBLIC_ENOUGH.has(option);
                    return (
                      <option
                        key={option}
                        value={option}
                        disabled={blocked}
                        title={blocked ? t("publish.brandedNotPrivate") : undefined}
                      >
                        {PRIVACY_LABELS[option] ?? option}
                        {blocked ? ` — ${t("publish.brandedNotPrivate")}` : ""}
                      </option>
                    );
                  })}
                </Select>
              </Field>

              {privacy && privacy !== "SELF_ONLY" ? (
                <Notice tone="warn">{t("publish.unaudited")}</Notice>
              ) : null}

              <div className="space-y-2.5">
                <label
                  className={cn(
                    "flex items-start gap-2.5 text-[13px]",
                    commentDisabled
                      ? "text-[var(--color-ink-faint)]"
                      : "text-[var(--color-ink-soft)]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={allowComment && !commentDisabled}
                    disabled={commentDisabled}
                    onChange={(e) => setAllowComment(e.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    {t("publish.allowComment")}
                    {commentDisabled ? (
                      <span className="block text-[11.5px]">
                        {t("publish.commentDisabled")}
                      </span>
                    ) : null}
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-[13px] text-[var(--color-ink-soft)]">
                  <input
                    type="checkbox"
                    checked={isAigc}
                    onChange={(e) => setIsAigc(e.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    {t("publish.aigc")}
                    <span className="block text-[11.5px] text-[var(--color-ink-faint)]">
                      {t("publish.aigcHint")}
                    </span>
                  </span>
                </label>
              </div>

              {/*
                The disclosure is one switch that reveals the two options, off
                by default, and publishing is refused while it is on with
                neither chosen. That is the shape the guidelines describe.
              */}
              <div className="rounded-[10px] border border-[var(--color-line)] p-3">
                <label className="flex items-start gap-2.5 text-[13px] font-medium">
                  <input
                    type="checkbox"
                    checked={discloses}
                    onChange={(e) => {
                      setDiscloses(e.target.checked);
                      if (!e.target.checked) {
                        setBrandContent(false);
                        setBrandOrganic(false);
                      }
                    }}
                    className="mt-0.5 size-4 accent-[var(--color-accent)]"
                  />
                  <span>{t("publish.disclosure")}</span>
                </label>

                {discloses ? (
                  <div className="mt-2.5 space-y-2.5 pl-6">
                    <label className="flex items-start gap-2.5 text-[13px] text-[var(--color-ink-soft)]">
                      <input
                        type="checkbox"
                        checked={brandOrganic}
                        onChange={(e) => setBrandOrganic(e.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--color-accent)]"
                      />
                      <span>{t("publish.brandOrganic")}</span>
                    </label>
                    <label className="flex items-start gap-2.5 text-[13px] text-[var(--color-ink-soft)]">
                      <input
                        type="checkbox"
                        checked={brandContent}
                        onChange={(e) => setBrandContent(e.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--color-accent)]"
                      />
                      <span>{t("publish.brandContent")}</span>
                    </label>

                    {brandContent || brandOrganic ? (
                      <p className="text-[11.5px] text-[var(--color-ink-faint)]">
                        {brandContent
                          ? t("publish.labelPaid")
                          : t("publish.labelPromotional")}
                      </p>
                    ) : (
                      <p className="text-[11.5px] text-[var(--color-danger)]">
                        {t("publish.disclosureNeeded")}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {results?.some((p) => p.error) ? (
            <Notice tone="danger" title={t("publish.someFailed")}>
              <ul className="mt-1 space-y-0.5">
                {results
                  .filter((p) => p.error)
                  .map((p) => (
                    <li key={p.openId}>
                      {p.username ? `@${p.username}` : p.openId.slice(-6)}:{" "}
                      {p.error}
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

          <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
            {t("publish.actionHint")}
          </p>
          {/* Required wording, and it has to sit directly above the buttons. */}
          <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
            {consent}
          </p>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              {t("publish.cancel")}
            </Button>
            <Button
              onClick={() => publish("MEDIA_UPLOAD")}
              loading={busy}
              disabled={selected.length === 0 || disclosureIncomplete}
            >
              {t("publish.sendDraft", { n: selected.length })}
            </Button>
            <Button
              variant="primary"
              onClick={() => publish("DIRECT_POST")}
              loading={busy}
              disabled={
                selected.length === 0 || disclosureIncomplete || !privacy
              }
            >
              {t("publish.postNow", { n: selected.length })}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
