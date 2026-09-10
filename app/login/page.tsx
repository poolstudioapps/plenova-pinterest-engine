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
        <LoginForm
          label={t("login.password")}
          cta={t("login.cta")}
          failed={t("login.failed")}
          unreachable={t("preview.unreachable")}
        />
      </div>
    </div>
  );
}
