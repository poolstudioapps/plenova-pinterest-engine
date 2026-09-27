import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { PlenovaMark } from "@/components/layout/PlenovaMark";
import { PottedPlant } from "@/components/plants/PottedPlant";
import { ButtonLink } from "@/components/ui";

/**
 * An address that leads nowhere: said plainly, in the studio's own look, with
 * the way back - rather than the framework's bare "404" on a white page.
 */
export default function NotFound() {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-[var(--color-frame)] px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[12%] left-1/2 h-[420px] w-[640px] max-w-[160vw] -translate-x-1/2 rounded-full bg-[var(--color-canvas)] opacity-90 blur-3xl"
      />
      <div className="rise-in relative w-full max-w-[380px] text-center">
        <PottedPlant className="mx-auto mb-4 size-24" />
        <div className="rounded-[28px] border border-[var(--color-edge)] bg-[var(--color-surface)] px-6 py-7 shadow-[var(--shadow-raised)]">
          <p className="figures text-[13px] font-semibold text-[var(--color-accent)]">404</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">Page introuvable</h1>
          <p className="mx-auto mt-2 max-w-[30ch] text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
            Cette adresse ne mène à rien dans le studio : un lien ancien, ou une
            faute de frappe.
          </p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href="/" variant="primary">
              <ArrowLeft aria-hidden size={16} weight="bold" />
              Retour au studio
            </ButtonLink>
          </div>
        </div>
        <div className="mt-5 flex justify-center">
          <PlenovaMark size={28} />
        </div>
      </div>
    </div>
  );
}
