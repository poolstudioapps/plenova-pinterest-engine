import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Terms of Service — ${LEGAL.toolName}`,
};

export default function TermsPage() {
  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
        Terms of Service
      </h1>
      <p className="text-[13px] text-[var(--color-ink-faint)]">
        Last updated {LEGAL.updated}
      </p>

      <h2>1. What this tool is</h2>
      <p>
        {LEGAL.toolName} is an internal content studio operated by{" "}
        <strong>{LEGAL.operator}</strong> for the Plenova houseplant care app. It
        generates plant-care images and copy, and publishes them to social
        accounts owned by the operator.
      </p>
      <p>
        It is <strong>not a public service</strong>. There is no sign-up, no
        end-user account, and no third party can obtain access to it. Access is
        restricted to authorised staff of {LEGAL.operator}.
      </p>

      <h2>2. Who may use it</h2>
      <p>
        Only staff authorised by {LEGAL.operator}. Access is password protected.
        Anyone using the tool must comply with the platform policies of every
        connected service, including the TikTok Community Guidelines, the TikTok
        Developer Terms of Service, and the Pinterest Community Guidelines.
      </p>

      <h2>3. Connected accounts</h2>
      <p>
        The tool connects to social accounts through each platform&apos;s official
        OAuth flow, and only to accounts the operator owns or is authorised to
        manage. It never posts to third-party accounts. A connection can be
        revoked at any time, from the tool or from the platform itself.
      </p>

      <h2>4. Generated content</h2>
      <p>
        Images and text are produced with Google&apos;s Gemini models from prompts
        written by the operator. Every item is reviewed by a human before it is
        published. The operator is responsible for the accuracy of the plant-care
        information published and for the content&apos;s compliance with each
        platform&apos;s rules.
      </p>

      <h2>5. Availability and liability</h2>
      <p>
        The tool is provided as-is for internal use. It depends on third-party
        APIs and may be unavailable or fail without notice. Because it is not
        offered to the public, no service level is promised and no warranty is
        given to any third party.
      </p>

      <h2>6. Changes</h2>
      <p>
        These terms may change as the tool evolves. The date above reflects the
        current version.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a
          href={`mailto:${LEGAL.contactEmail}`}
          className="text-[var(--color-accent)] hover:underline"
        >
          {LEGAL.contactEmail}
        </a>
      </p>
    </>
  );
}
