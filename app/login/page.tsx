import { LoginForm } from "@/components/layout/LoginForm";
import { translator } from "@/lib/i18n";
import { getUiLocale } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const locale = await getUiLocale();
  const t = translator(locale);

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--color-accent)] text-[16px] font-semibold text-white">
            P
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-[-0.01em]">Plenova</p>
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              Pinterest Engine
            </p>
          </div>
        </div>
        {/*
          * Platform reviewers (TikTok, Pinterest) open the declared website URL
          * and land here. A bare password box tells them nothing, so the page
          * states what the tool is and links to the legal pages they need.
          */}
        <p className="mb-5 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
          {t("login.intro")}
        </p>

        <LoginForm
          label={t("login.password")}
          cta={t("login.cta")}
          failed={t("login.failed")}
          unreachable={t("preview.unreachable")}
        />

        <div className="mt-5 flex justify-center gap-4 text-[12.5px]">
          <a
            href="/legal/terms"
            className="text-[var(--color-ink-faint)] hover:text-[var(--color-accent)] hover:underline"
          >
            {t("login.terms")}
          </a>
          <a
            href="/legal/privacy"
            className="text-[var(--color-ink-faint)] hover:text-[var(--color-accent)] hover:underline"
          >
            {t("login.privacy")}
          </a>
        </div>
      </div>
    </div>
  );
}
