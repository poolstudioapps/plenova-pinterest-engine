import { LoginForm } from "@/components/layout/LoginForm";
import { PlenovaMark } from "@/components/layout/PlenovaMark";
import { translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = translator();

  return (
    // Its own full-height shell now: the login page sits outside the dashboard
    // group, so nothing else on screen belongs to the signed-in tool.
    <div className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <PlenovaMark className="size-9 rounded-[10px]" />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-[-0.01em]">Plenova</p>
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              Studio
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

        <LoginForm />

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
