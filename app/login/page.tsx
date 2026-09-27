import { LoginForm } from "@/components/layout/LoginForm";
import { PlenovaMark } from "@/components/layout/PlenovaMark";
import { Plant3D } from "@/components/plants/Plant3D";
import { translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = translator();

  return (
    // Its own full-height shell now: the login page sits outside the dashboard
    // group, so nothing else on screen belongs to the signed-in tool.
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-[var(--color-frame)] px-5 py-10">
      {/* A pool of light behind the plant: the frame green lifts to the
          page green where the eye should land. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[8%] left-1/2 h-[480px] w-[720px] max-w-[160vw] -translate-x-1/2 rounded-full bg-[var(--color-canvas)] opacity-90 blur-3xl"
      />
      <div className="rise-in relative w-full max-w-[400px]">
        {/* Follows the pointer; decorative, so hidden from assistive tech. It
            stands on the card rather than floating above the page. */}
        <Plant3D className="relative z-10 mx-auto -mb-14 h-[230px] w-full max-w-[290px]" floating={6} />
        <div className="rounded-[28px] border border-[var(--color-edge)] bg-[var(--color-surface)] px-6 pt-14 pb-6 shadow-[var(--shadow-raised)] sm:px-7">
          <div className="mb-4 flex items-center gap-3">
            <PlenovaMark size={40} />
            <div className="leading-none">
              <h1 className="text-[21px] font-bold tracking-[-0.02em]">Plenova Studio</h1>
            </div>
          </div>
          {/*
            * Platform reviewers (TikTok, Pinterest) open the declared website URL
            * and land here. A bare password box tells them nothing, so the page
            * states what the tool is and links to the legal pages they need.
            */}
          <p className="mb-6 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
            {t("login.intro")}
          </p>

          <LoginForm />
        </div>

        <div className="mt-5 flex justify-center gap-5 text-[12.5px]">
          <a
            href="/legal/terms"
            className="text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-accent)]"
          >
            {t("login.terms")}
          </a>
          <a
            href="/legal/privacy"
            className="text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-accent)]"
          >
            {t("login.privacy")}
          </a>
        </div>
      </div>
    </div>
  );
}
