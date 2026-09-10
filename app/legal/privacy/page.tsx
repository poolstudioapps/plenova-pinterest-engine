import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${LEGAL.toolName}`,
};

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
        Privacy Policy
      </h1>
      <p className="text-[13px] text-[var(--color-ink-faint)]">
        Last updated {LEGAL.updated}
      </p>

      <h2>1. Scope</h2>
      <p>
        {LEGAL.toolName} is an internal content studio operated by{" "}
        <strong>{LEGAL.operator}</strong>. It is used only by authorised staff to
        publish to the operator&apos;s own social accounts.
      </p>
      <p>
        <strong>
          It collects no personal data from members of the public, and has no
          end users other than the operator&apos;s own staff.
        </strong>
      </p>

      <h2>2. What is stored</h2>
      <ul>
        <li>
          <strong>Access tokens</strong> for the social accounts the operator
          connects, obtained through each platform&apos;s official OAuth flow.
        </li>
        <li>
          <strong>Basic profile information</strong> of those connected accounts
          — username, display name, avatar — so the operator can see which
          account content will be posted to.
        </li>
        <li>
          <strong>Generated content</strong>: images, titles, descriptions and
          keywords produced by the tool, and the publishing status of each item.
        </li>
      </ul>
      <p>
        No browsing data, analytics or tracking cookies are collected. The only
        cookies set are a session cookie for staff sign-in and a cookie
        remembering the chosen interface language.
      </p>

      <h2>3. How tokens are protected</h2>
      <p>
        Access tokens are encrypted with AES-256-GCM before being written to
        storage, and the encryption key is held only as a server-side
        environment variable. Tokens are never sent to the browser, never
        written to logs, and never shared with anyone.
      </p>

      <h2>4. Processors</h2>
      <p>The tool sends data to these services, and no others:</p>
      <ul>
        <li>
          <strong>Google Gemini</strong> — receives the text prompts used to
          generate content.
        </li>
        <li>
          <strong>Vercel</strong> — hosts the application and stores generated
          images and records.
        </li>
        <li>
          <strong>Pinterest and TikTok</strong> — receive the content the
          operator chooses to publish, through their official APIs.
        </li>
      </ul>
      <p>No data is sold, and none is shared for advertising purposes.</p>

      <h2>5. Retention and deletion</h2>
      <p>
        Generated content is kept until the operator deletes it from the tool.
        Access tokens are deleted immediately when an account is disconnected.
        Disconnecting can also be done from the platform&apos;s own settings, which
        revokes the token independently of this tool.
      </p>

      <h2>6. Contact</h2>
      <p>
        For any question about this policy, or to request deletion of data held
        by the tool:{" "}
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
