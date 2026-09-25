/**
 * TikTok spy - runs on the operator's computer, once a day.
 *
 *   npm run spy                       every enabled account
 *   npm run spy -- --only=leafjournal  one account
 *   npm run spy -- --dry               read everything, write nothing
 *   npm run spy -- --days=30           look further back than two weeks
 *   npm run spy -- --hooks-only        only read the covers not read yet
 *
 * Why here and not on a server: TikTok answers a home connection and blocks
 * datacenters, and scraping from the app registered with TikTok for publishing
 * would put that registration at risk. A scheduled Windows task runs this, and
 * everything it finds goes straight into Supabase, where the app reads it.
 *
 * No browser. A piloted Chrome gets an empty post list from TikTok's own API
 * (measured, headless and visible alike), so this reads the two public pages
 * that carry the data server-side instead:
 *  - the profile's embed page (/embed/@name): its latest posts, and the profile;
 *  - each post's own page: its slides, date and every number.
 *
 * Connects by itself: the Supabase address and key come from .env.local, the
 * list of accounts from the spy_accounts table - add or pause accounts in the
 * app, never here.
 *
 * Per account, the carousels (photo posts) of the last LOOKBACK_DAYS days:
 *  - a new one: its slides copied to the "spy" bucket (TikTok's links expire
 *    within days), then its row created;
 *  - one already known: only its numbers refreshed. Its status - set aside,
 *    processed - belongs to the operator and is never touched.
 * Nothing new means nothing written but the pass itself: no model call, no
 * invented content.
 *
 * Then the covers not read yet go to Gemini - the app's own code, loaded
 * through jiti - and each hook lands in the hook bank as an idea, with its
 * post's numbers as evidence (lib/spy-hooks.ts).
 */
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import sharp from "sharp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "spy";
const MAX_SLIDES = 35;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
/** How far back a carousel still counts; --days=30 to look further once. */
const LOOKBACK_DAYS = Number(args.get("days")) || 14;

// ------------------------------------------------------------------ logging

const dataDir = path.join(ROOT, ".data");
const logDir = path.join(dataDir, "spy-logs");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`);
function log(...parts) {
  const line = `[${new Date().toLocaleTimeString("fr-FR")}] ${parts.join(" ")}`;
  console.log(line);
  fs.appendFileSync(logFile, line + "\n");
}

/**
 * Posts already found to be videos, so they are not fetched again every day.
 * Local on purpose: it is only a shortcut, and losing it costs a few requests.
 */
const videosFile = path.join(dataDir, "spy-videos.json");
const knownVideos = new Set(
  fs.existsSync(videosFile) ? JSON.parse(fs.readFileSync(videosFile, "utf8")) : [],
);

// ----------------------------------------------------------------- supabase

process.loadEnvFile(path.join(ROOT, ".env.local"));
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  log("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manque dans .env.local - arrêt.");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function check(what, error) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ------------------------------------------------------------------ tiktok

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A pause between requests, so the pass looks like someone browsing. */
const breathe = () => sleep(1200 + Math.random() * 1800);

async function getPage(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`TikTok a répondu ${res.status}`);
  return res.text();
}

function jsonScript(html, id) {
  const match = html.match(new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** A TikTok id carries its creation time in its top 32 bits. */
function createdAt(id) {
  try {
    return Number(BigInt(id) >> 32n);
  } catch {
    return 0;
  }
}

/** The profile and its latest posts, from the embed page. */
async function readProfile(username) {
  const res = await fetch(`https://www.tiktok.com/embed/@${encodeURIComponent(username)}`, {
    headers: HEADERS,
    redirect: "follow",
  });
  // TikTok answers 400 for an account that is suspended, deleted or renamed.
  if (res.status === 400 || res.status === 404) {
    throw new Error("compte introuvable sur TikTok (suspendu, supprimé ou renommé)");
  }
  if (!res.ok) throw new Error(`TikTok a répondu ${res.status}`);
  const html = await res.text();
  const state = jsonScript(html, "__FRONTITY_CONNECT_STATE__");
  const entry = Object.values(state?.source?.data ?? {}).find((d) => d && Array.isArray(d.videoList));
  if (!entry) throw new Error("profil introuvable (compte privé, supprimé ou renommé ?)");
  const user = entry.userInfo ?? {};
  return {
    profile: {
      displayName: user.nickname ?? null,
      avatarUrl: user.avatarThumbUrl ?? null,
      followers: Number(user.followerCount) || null,
    },
    ids: entry.videoList.map((v) => String(v.id)).filter(Boolean),
  };
}

/** One post in full, or null when it is a video rather than a carousel. */
async function readPost(username, id) {
  const html = await getPage(`https://www.tiktok.com/@${encodeURIComponent(username)}/video/${id}`);
  const data = jsonScript(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
  const detail = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"];
  const item = detail?.itemInfo?.itemStruct;
  if (!item) throw new Error(`post ${id} illisible (statut ${detail?.statusCode ?? "?"})`);
  const images = item.imagePost?.images ?? [];
  if (images.length === 0) return null;
  const stats = { ...(item.stats ?? {}), ...(item.statsV2 ?? {}) };
  const num = (k) => Number(stats[k]) || 0;
  return {
    id,
    caption: (item.desc ?? "").trim(),
    createTime: Number(item.createTime) || createdAt(id),
    views: num("playCount"),
    likes: num("diggCount"),
    comments: num("commentCount"),
    shares: num("shareCount"),
    saves: num("collectCount"),
    slides: images
      .map((img) => {
        const urls = img.imageURL?.urlList ?? [];
        return urls.find((u) => !/heic/i.test(u)) ?? null;
      })
      .filter(Boolean)
      .slice(0, MAX_SLIDES),
  };
}

// ------------------------------------------------------------------ storage

/** Copies a picture into the bucket as a JPEG, at most 1080 wide. */
async function copyImage(url, dest, width = 1080) {
  const res = await fetch(url, { headers: { ...HEADERS, Referer: "https://www.tiktok.com/" } });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const { error } = await db.storage.from(BUCKET).upload(dest, data, {
    contentType: "image/jpeg",
    upsert: true,
  });
  check(`envoi de ${dest}`, error);
  return {
    url: db.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl,
    width: info.width,
    height: info.height,
  };
}

// -------------------------------------------------------------------- hooks

/**
 * Reads the covers not read yet, with the app's own module: one prompt, one
 * voice, one way of filing - whether the app or this script does it.
 */
async function readHooks() {
  try {
    const jiti = createJiti(import.meta.url, {
      alias: { "@": ROOT, "server-only": path.join(ROOT, "scripts", "server-only-shim.mjs") },
    });
    const { analyzeSpyHooks } = await jiti.import(path.join(ROOT, "lib", "spy-hooks.ts"));
    const run = await analyzeSpyHooks({ log });
    log(`Hooks : ${run.read} couverture(s) lue(s), ${run.filed} idée(s) ajoutée(s), ${run.failed} échec(s), ${run.left} en attente.`);
  } catch (err) {
    // The pass itself is already saved; the covers will be read next time.
    log(`Hooks : lecture impossible - ${err instanceof Error ? err.message : err}`);
  }
}

// --------------------------------------------------------------------- main

async function main() {
  const dry = args.has("dry");
  const only = args.get("only");
  if (args.has("hooks-only")) {
    await readHooks();
    return;
  }

  let query = db.from("spy_accounts").select("username").eq("enabled", true).order("username");
  if (only) query = db.from("spy_accounts").select("username").eq("username", only.toLowerCase());
  const { data: accountRows, error: accountsError } = await query;
  check("lecture des comptes", accountsError);
  const accounts = (accountRows ?? []).map((r) => r.username);
  if (accounts.length === 0) {
    log("Aucun compte actif à visiter. Ajoute-en dans l'app : Spy > Comptes.");
    return;
  }

  let runId = null;
  if (!dry) {
    const { data, error } = await db
      .from("spy_runs")
      .insert({ accounts: accounts.length, host: os.hostname() })
      .select("id")
      .single();
    check("début du passage", error);
    runId = data.id;
  }
  log(`Spy : ${accounts.length} compte(s), ${LOOKBACK_DAYS} derniers jours${dry ? " (essai, rien n'est écrit)" : ""}.`);

  const cutoff = Date.now() / 1000 - LOOKBACK_DAYS * 86400;
  // Running totals, so whatever stops the pass, the run record says what it did.
  let found = 0;
  let added = 0;
  const errors = [];

  try {
    for (const [i, username] of accounts.entries()) {
      await visit(username, { dry, cutoff, errors, count: (f, a) => ((found += f), (added += a)) });
      if (i < accounts.length - 1) await sleep(3000 + Math.random() * 3000);
    }
  } catch (err) {
    errors.push({ username: "*", message: `passage interrompu : ${err instanceof Error ? err.message : err}`.slice(0, 300) });
    throw err;
  } finally {
    fs.writeFileSync(videosFile, JSON.stringify([...knownVideos].slice(-5000)));
    if (runId !== null) {
      // Always closed, even after a fatal error, so the app never shows an
      // unfinished pass as a clean one.
      const { error } = await db
        .from("spy_runs")
        .update({ finished_at: new Date().toISOString(), found, added, errors })
        .eq("id", runId);
      if (error) log(`Fin du passage non enregistrée : ${error.message}`);
    }
    log(`Terminé : ${found} carrousel(s) vus, ${added} nouveau(x), ${errors.length} erreur(s).`);
  }
  if (!dry) await readHooks();
}

/**
 * One account. A post that fails - unreadable page, an image that will not
 * copy - is skipped and counted, never the whole account; the account is
 * marked in error only when TikTok would not show any of its posts.
 */
async function visit(username, { dry, cutoff, errors, count }) {
  const now = new Date().toISOString();
  try {
    const { profile, ids } = await readProfile(username);
    const listed = ids.filter((id) => createdAt(id) >= cutoff && !knownVideos.has(id));

    // Posts already stored and still in the window, even once they have left
    // the embed page's short list: their numbers keep being refreshed, so the
    // tier list never compares a day-old count with a week-old one.
    const { data: stored, error: storedError } = await db
      .from("spy_posts")
      .select("id")
      .eq("username", username)
      .gte("posted_at", new Date(cutoff * 1000).toISOString());
    check("lecture des carrousels connus", storedError);
    const knownIds = new Set((stored ?? []).map((r) => r.id));
    const candidates = Array.from(new Set([...listed, ...knownIds]));

    let carousels = 0;
    let fresh = 0;
    let unreadable = 0;
    let failedPosts = 0;
    for (const id of candidates) {
      await breathe();
      let post;
      try {
        post = await readPost(username, id);
      } catch (err) {
        unreadable += 1;
        log(`  @${username} ${id} : ${err instanceof Error ? err.message : err}`);
        continue;
      }
      if (!post) {
        knownVideos.add(id);
        continue;
      }
      carousels += 1;
      count(1, 0);
      if (dry) continue;
      const stats = {
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        saves: post.saves,
        stats_updated_at: now,
      };
      try {
        if (knownIds.has(id)) {
          const { error } = await db.from("spy_posts").update(stats).eq("id", id);
          check("mise à jour des chiffres", error);
          continue;
        }
        const images = [];
        for (const [n, url] of post.slides.entries()) {
          images.push(await copyImage(url, `${username}/${id}/${String(n + 1).padStart(2, "0")}.jpg`));
        }
        const { error } = await db.from("spy_posts").insert({
          id,
          username,
          url: `https://www.tiktok.com/@${username}/photo/${id}`,
          caption: post.caption,
          posted_at: new Date(post.createTime * 1000).toISOString(),
          images,
          ...stats,
        });
        check("enregistrement d'un carrousel", error);
        fresh += 1;
        count(0, 1);
      } catch (err) {
        // Retried tomorrow: a post not recorded is still new then.
        failedPosts += 1;
        log(`  @${username} ${id} : non enregistré - ${err instanceof Error ? err.message : err}`);
      }
    }

    // TikTok answering the profile but refusing every post is a block, not
    // an account that stopped posting - said as such.
    const blocked = candidates.length > 0 && unreadable === candidates.length;
    const problems = [
      blocked ? `TikTok n'a laissé lire aucun des ${unreadable} posts (limite ou vérification anti-robot)` : "",
      !blocked && unreadable > 0 ? `${unreadable} post(s) illisible(s)` : "",
      failedPosts > 0 ? `${failedPosts} carrousel(s) non enregistré(s)` : "",
    ].filter(Boolean);
    if (problems.length > 0) errors.push({ username, message: problems.join(", ") });

    if (!dry) {
      // The avatar too: TikTok's link to it expires.
      let avatar = null;
      if (profile.avatarUrl) {
        try {
          avatar = (await copyImage(profile.avatarUrl, `avatars/${username}.jpg`, 200)).url;
        } catch {
          avatar = null;
        }
      }
      const { error } = await db
        .from("spy_accounts")
        .update({
          last_checked_at: now,
          last_status: blocked ? "error" : carousels > 0 ? "ok" : "empty",
          last_error: problems.length > 0 ? problems.join(", ") : null,
          last_found: carousels,
          ...(profile.displayName ? { display_name: profile.displayName } : {}),
          ...(avatar ? { avatar_url: avatar } : {}),
          ...(profile.followers ? { followers: profile.followers } : {}),
        })
        .eq("username", username);
      check("mise à jour du compte", error);
    }
    log(`@${username} : ${carousels} carrousel(s) sur ${LOOKBACK_DAYS} jours, ${fresh} nouveau(x)${problems.length ? ` - ${problems.join(", ")}` : ""}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ username, message: message.slice(0, 300) });
    log(`@${username} : échec - ${message}`);
    if (!dry) {
      await db
        .from("spy_accounts")
        .update({ last_checked_at: now, last_status: "error", last_error: message.slice(0, 300) })
        .eq("username", username);
    }
  }
}

main().catch((err) => {
  log(`Erreur fatale : ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
