"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Notice, Spinner } from "@/components/ui";
import { SpyPostCard } from "@/components/spy/SpyPostCard";
import type { ImageMode } from "@/components/spy/ProcessDialog";
import { translator, type ContentLocale } from "@/lib/i18n";
import type { OverlayStyle } from "@/lib/overlay";
import { sortSpyPosts } from "@/lib/spy-format";
import type { CarouselRecord, SpyAccount, SpyPost } from "@/lib/types";

const SHOWN = 6;

/**
 * The spy's best finds, inside the Repost tab: one click rebuilds a carousel
 * with the languages, text style and image mode already chosen on the tab.
 */
export function SpyInbox({
  languages,
  overlayStyle,
  imageMode,
  disabled,
  onStarted,
}: {
  languages: ContentLocale[];
  overlayStyle: OverlayStyle;
  imageMode: ImageMode;
  disabled: boolean;
  onStarted: (carousel: CarouselRecord) => void;
}) {
  const t = translator();
  const [posts, setPosts] = useState<SpyPost[] | null>(null);
  const [accounts, setAccounts] = useState<SpyAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/spy")
      .then((res) => res.json())
      .then((data: { posts?: SpyPost[]; accounts?: SpyAccount[] }) => {
        if (!live) return;
        setPosts((data.posts ?? []).filter((p) => p.status === "new"));
        setAccounts(data.accounts ?? []);
      })
      .catch(() => live && setPosts([]));
    return () => {
      live = false;
    };
  }, []);

  async function process(post: SpyPost) {
    setBusy(post.id);
    setError(null);
    try {
      const res = await fetch(`/api/spy/posts/${encodeURIComponent(post.id)}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages, overlayStyle, imageMode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        carousel?: CarouselRecord;
        error?: { message?: string };
      };
      if (!res.ok || !data.carousel) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      setPosts((current) => (current ?? []).filter((p) => p.id !== post.id));
      onStarted(data.carousel);
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(post: SpyPost) {
    setPosts((current) => (current ?? []).filter((p) => p.id !== post.id));
    try {
      await fetch(`/api/spy/posts/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
    } catch {
      // Still in the spy page's list if this did not land; nothing is lost.
    }
  }

  const top = posts ? sortSpyPosts(posts, "engagement").slice(0, SHOWN) : [];
  const byName = new Map(accounts.map((a) => [a.username, a]));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{t("repost.fromSpy")}</h3>
        <Link href="/spy" className="text-[12.5px] font-medium text-[var(--color-accent)] hover:underline">
          {t("spy.seeAll")}
          {posts && posts.length > 0 ? ` (${posts.length})` : ""}
        </Link>
      </div>
      <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">{t("repost.fromSpyHint")}</p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {posts === null ? (
        <Spinner />
      ) : top.length === 0 ? (
        <p className="text-[12.5px] text-[var(--color-ink-faint)]">{t("repost.fromSpyEmpty")}</p>
      ) : (
        <div className="grid gap-3">
          {top.map((post) => (
            <SpyPostCard
              key={post.id}
              post={post}
              account={byName.get(post.username)}
              compact
              actions={
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void process(post)}
                    loading={busy === post.id}
                    disabled={disabled || busy !== null || languages.length === 0}
                  >
                    {t("spy.process")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void dismiss(post)} disabled={busy === post.id}>
                    {t("spy.dismiss")}
                  </Button>
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-[12.5px] font-medium text-[var(--color-accent)] hover:underline"
                  >
                    {t("spy.openTikTok")}
                  </a>
                </>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
