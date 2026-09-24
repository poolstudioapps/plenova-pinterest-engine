/**
 * The dev server, unable to reach production.
 *
 * `.env.local` carries the live Supabase service key, so a plain `next dev`
 * talks to the real database - and a local run with no image host attached
 * once wrote megabytes of inlined pictures into it and took the site down.
 *
 * This blanks the storage credentials before Next loads its env files (Next
 * leaves variables already present in process.env alone), so the app falls
 * back to its local file store. Same UI, same code paths, nothing shared.
 *
 *   npm run dev:offline
 */
import { spawn } from "node:child_process";

const ISOLATED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BLOB_READ_WRITE_TOKEN",
  // With no password set the gate stays open (see middleware.ts) - which is
  // what you want locally, and it keeps the live session secret out of a
  // throwaway dev process.
  "ADMIN_PASSWORD",
];

const env = { ...process.env };
for (const key of ISOLATED) env[key] = "";

console.log(`[dev:offline] storage isolated (${ISOLATED.join(", ")} blanked)`);

// `shell: true` because on Windows the target is npx.cmd, which Node refuses
// to spawn directly (EINVAL) since its child_process hardening.
const child = spawn("npx next dev " + process.argv.slice(2).join(" "), {
  stdio: "inherit",
  env,
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
