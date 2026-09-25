/**
 * Plenova Spy - the program shipped in the "Plenova Spy" folder.
 *
 * Double-click "Lancer le spy.bat". It visits every account listed in the app
 * (Spy > Comptes, and our own on the Versus page), reads what they posted, and
 * sends it to the app. It holds no database key: only an access code, created
 * and revoked in the app, kept in config.json next to this file.
 *
 * Built into the folder by scripts/build-spy-kit.mjs, with its own node.exe:
 * nothing has to be installed on the computer that runs it.
 *
 * How TikTok is read: no browser. A piloted Chrome gets an empty post list,
 * so this reads two public pages rendered by TikTok's servers - the profile's
 * embed page (its latest posts, the profile) and each post's page (its slides,
 * date and numbers).
 *
 * What is read each pass (the app decides, in its plan): the posts it does not
 * have yet - a competitor's carousels of the last two weeks, anything of ours -
 * and, for their numbers, the stored ones published in the week before the
 * last pass (a month for ours). Plus, once, an account's history when the app
 * queued it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, "..");
const CONFIG = path.join(KIT, "config.json");
const CACHE = path.join(HERE, "cache");
const LOGS = path.join(KIT, "logs");
const DEFAULT_SERVER = "https://studio.latelierugc.com";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const TIKTOK_TIMEOUT = 30_000;
const APP_TIMEOUT = 90_000;
const TIKTOK_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};
/** TikTok's answers for a post that is gone: deleted, private, or taken down. */
const GONE_CODES = new Set([10204, 10216, 10222]);
const args = new Set(process.argv.slice(2));
const interactive = process.stdin.isTTY && !args.has("--no-pause");

// ------------------------------------------------------------------ output

let logFile = null;
const paint = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => paint("32", t);
const red = (t) => paint("31", t);
const dim = (t) => paint("2", t);
const bold = (t) => paint("1", t);

function writeLog(line) {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    // A log that cannot be written never stops the pass.
  }
}

function log(line, show = line) {
  console.log(show);
  writeLog(`[${new Date().toLocaleTimeString("fr-FR")}] ${line.replace(/\x1b\[\d+m/g, "")}\n`);
}

async function pauseBeforeClosing() {
  if (!interactive) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(dim("\nAppuie sur Entrée pour fermer cette fenêtre."));
  rl.close();
}

// ------------------------------------------------------------------ config

function readConfig() {
  if (!fs.existsSync(CONFIG)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  } catch {
    log(`config.json est illisible (${CONFIG}) : le code d'accès va être redemandé.`);
    return {};
  }
}

async function ensureToken(config) {
  if (typeof config.token === "string" && config.token.startsWith("spy_")) return config;
  if (!interactive) throw new Error(`Aucun code d'accès valable dans ${CONFIG}. Relance le spy par un double-clic : il le demandera.`);
  console.log(bold("\nIl faut le code d'accès du spy."));
  console.log("Dans l'app : Spy > onglet Comptes > Ordinateurs > « Autoriser un ordinateur ».");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const token = (await rl.question("Colle le code ici puis appuie sur Entrée : ")).trim();
  rl.close();
  if (!token.startsWith("spy_")) throw new Error("Ce n'est pas un code d'accès du spy (il commence par spy_).");
  const next = { server: config.server || DEFAULT_SERVER, token };
  fs.writeFileSync(CONFIG, JSON.stringify(next, null, 2));
  return next;
}

// --------------------------------------------------------------------- app

function makeApi({ server, token }) {
  const base = (server || DEFAULT_SERVER).replace(/\/+$/, "");
  return async function api(method, route, body, { attempts = 3 } = {}) {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${base}/api/spy/agent/${route}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-spy-host": os.hostname(),
          },
          signal: AbortSignal.timeout(APP_TIMEOUT),
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) return data;
        const message = data?.error?.message ?? `l'app a répondu ${res.status}`;
        // Refused or invalid: trying again changes nothing.
        if (res.status < 500) throw Object.assign(new Error(message), { final: true, status: res.status });
        throw new Error(message);
      } catch (err) {
        if (err.final || attempt >= attempts) throw err;
        await sleep(2000 * attempt);
      }
    }
  };
}

// ------------------------------------------------------------------ tiktok

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const breathe = () => sleep(1200 + Math.random() * 1800);

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

async function readProfile(username) {
  const res = await fetch(`https://www.tiktok.com/embed/@${encodeURIComponent(username)}`, {
    headers: TIKTOK_HEADERS,
    signal: AbortSignal.timeout(TIKTOK_TIMEOUT),
  });
  if (res.status === 400 || res.status === 404) {
    throw new Error("compte introuvable sur TikTok (suspendu, supprimé ou renommé)");
  }
  if (!res.ok) throw new Error(`TikTok a répondu ${res.status}`);
  const state = jsonScript(await res.text(), "__FRONTITY_CONNECT_STATE__");
  const entry = Object.values(state?.source?.data ?? {}).find((d) => d && Array.isArray(d.videoList));
  if (!entry) throw new Error("profil illisible (compte privé ?)");
  const user = entry.userInfo ?? {};
  return {
    displayName: user.nickname ?? null,
    avatarUrl: user.avatarThumbUrl ?? null,
    followers: Number(user.followerCount) || null,
    likesTotal: Number(user.heartCount) || null,
    ids: entry.videoList.map((v) => String(v.id)).filter(Boolean),
  };
}

const positive = (n) => (Number(n) > 0 ? Math.round(Number(n)) : undefined);

/** One post in full: a carousel with its slides, or a video with its cover. */
async function readPost(username, id) {
  const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}/video/${id}`, {
    headers: TIKTOK_HEADERS,
    signal: AbortSignal.timeout(TIKTOK_TIMEOUT),
  });
  if (res.status === 404) throw Object.assign(new Error("post introuvable"), { gone: true });
  if (!res.ok) throw new Error(`TikTok a répondu ${res.status}`);
  const detail = jsonScript(await res.text(), "__UNIVERSAL_DATA_FOR_REHYDRATION__")?.__DEFAULT_SCOPE__?.[
    "webapp.video-detail"
  ];
  const item = detail?.itemInfo?.itemStruct;
  if (!item) {
    throw Object.assign(new Error(`page illisible (statut ${detail?.statusCode ?? "?"})`), {
      gone: GONE_CODES.has(Number(detail?.statusCode)),
    });
  }
  const stats = { ...(item.stats ?? {}), ...(item.statsV2 ?? {}) };
  const num = (k) => Number(stats[k]) || 0;
  const images = item.imagePost?.images ?? [];
  const pick = (urls) => (urls ?? []).find((u) => !/heic/i.test(u)) ?? null;
  const cover = item.video?.originCover || item.video?.cover;
  return {
    id,
    mediaType: images.length > 0 ? "carousel" : "video",
    caption: (item.desc ?? "").trim(),
    postedAt: new Date((Number(item.createTime) || createdAt(id)) * 1000).toISOString(),
    views: num("playCount"),
    likes: num("diggCount"),
    comments: num("commentCount"),
    shares: num("shareCount"),
    saves: num("collectCount"),
    pictures:
      images.length > 0
        ? images
            .map((img) => ({
              url: pick(img.imageURL?.urlList),
              width: positive(img.imageWidth),
              height: positive(img.imageHeight),
            }))
            .filter((p) => p.url)
            .slice(0, 35)
        : cover
          ? [{ url: cover, width: positive(item.video?.width), height: positive(item.video?.height) }]
          : [],
  };
}

/** What the bytes are, from their first few. */
function sniffImage(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") return "png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Copies one picture from TikTok into the app's storage. */
async function sendPicture(api, picture, dest) {
  const res = await fetch(picture.url, {
    headers: { ...TIKTOK_HEADERS, Referer: "https://www.tiktok.com/" },
    signal: AbortSignal.timeout(TIKTOK_TIMEOUT),
  });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("image trop lourde");
  const ext = sniffImage(bytes);
  if (!ext) throw new Error("format d'image inconnu");
  const { url } = await api("POST", "images", { path: `${dest}.${ext}`, data: bytes.toString("base64") });
  return { url, ...(picture.width ? { width: picture.width } : {}), ...(picture.height ? { height: picture.height } : {}) };
}

// --------------------------------------------------------------------- run

/** Competitors' videos, remembered so they are not fetched again every day. */
let videosFile = null;
let knownVideos = new Set();

function init() {
  fs.mkdirSync(LOGS, { recursive: true });
  logFile = path.join(LOGS, `${new Date().toISOString().slice(0, 10)}.log`);
  fs.mkdirSync(CACHE, { recursive: true });
  videosFile = path.join(CACHE, "videos.json");
  try {
    if (fs.existsSync(videosFile)) knownVideos = new Set(JSON.parse(fs.readFileSync(videosFile, "utf8")));
  } catch {
    // A damaged cache only costs a few extra page loads: start it again.
    knownVideos = new Set();
  }
}

function saveCache() {
  try {
    if (videosFile) fs.writeFileSync(videosFile, JSON.stringify([...knownVideos].slice(-5000)));
  } catch {
    // Same: only a cache.
  }
}

async function visit(api, account, totals) {
  const { username, ours, windowDays } = account;
  const cutoff = Date.now() / 1000 - windowDays * 86400;
  const stored = new Set(account.stored ?? []);
  const refresh = new Set(account.known ?? []);
  const history = (account.backfill ?? []).filter((id) => !stored.has(id) && !refresh.has(id));
  let profile;
  try {
    profile = await readProfile(username);
  } catch (err) {
    totals.errors.push({ username, message: err.message });
    log(`@${username} : ${err.message}`, `  ${red("✗")} @${username} ${dim(err.message)}`);
    await api("POST", "accounts", { account: { username, status: "error", error: err.message } }).catch((e) => {
      if (e.status === 401) throw e;
    });
    return;
  }

  // New posts of the window, the stored ones due for fresh numbers, then the history.
  const listed = profile.ids.filter(
    (id) => createdAt(id) >= cutoff && !stored.has(id) && !refresh.has(id) && (ours || !knownVideos.has(id)),
  );
  const candidates = Array.from(new Set([...listed, ...refresh, ...history]));
  const historySet = new Set(history);
  if (history.length > 0) {
    log(`@${username} : ${history.length} post(s) d'historique à récupérer.`, `  ${dim(`@${username} : ${history.length} post(s) d'historique à récupérer, patience…`)}`);
  }
  let found = 0;
  let fresh = 0;
  let unreadable = 0;
  let failed = 0;
  const gone = [];

  for (const [n, id] of candidates.entries()) {
    if (candidates.length > 40 && n > 0 && n % 25 === 0) console.log(dim(`    … ${n}/${candidates.length}`));
    await breathe();
    let post;
    try {
      post = await readPost(username, id);
    } catch (err) {
      // Gone from TikTok, and not on the profile either: nothing is wrong with the spy.
      if (err.gone && !profile.ids.includes(id)) {
        gone.push(id);
      } else {
        unreadable += 1;
      }
      writeLog(`  @${username} ${id} : ${err.message}\n`);
      continue;
    }
    if (post.mediaType === "video" && !ours) {
      knownVideos.add(id);
      // A competitor video queued with the history: never wanted, out of the queue.
      if (historySet.has(id)) gone.push(id);
      continue;
    }
    // A competitor's old carousel from the history: its cover and numbers only.
    const oldHistory = !ours && historySet.has(id) && createdAt(id) < cutoff;
    found += 1;
    totals.found += 1;
    if (!ours) totals.carousels += 1;
    try {
      const body = {
        id,
        username,
        mediaType: post.mediaType,
        caption: post.caption,
        postedAt: post.postedAt,
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        saves: post.saves,
      };
      if (oldHistory) body.history = true;
      if (!refresh.has(id)) {
        // Ours are measured, never rebuilt, and old history is only ranked: a cover is enough.
        const pictures = ours || oldHistory ? post.pictures.slice(0, 1) : post.pictures;
        const images = [];
        for (const [i, picture] of pictures.entries()) {
          const name = post.mediaType === "video" ? "cover" : String(i + 1).padStart(2, "0");
          images.push(await sendPicture(api, picture, `${username}/${id}/${name}`));
        }
        body.images = images;
      }
      const { created } = await api("POST", "posts", { post: body });
      if (created) {
        fresh += 1;
        totals.added += 1;
        if (!ours) totals.newCarousels += 1;
      }
    } catch (err) {
      if (err.status === 401) throw err;
      failed += 1;
      writeLog(`  @${username} ${id} : non envoyé - ${err.message}\n`);
    }
  }

  const tried = candidates.length - gone.length;
  const blocked = tried > 0 && unreadable === tried;
  const problems = [
    blocked ? `TikTok n'a laissé lire aucun des ${unreadable} posts (limite ou vérification anti-robot)` : "",
    !blocked && unreadable > 0 ? `${unreadable} post(s) illisible(s)` : "",
    failed > 0 ? `${failed} post(s) non envoyé(s)` : "",
  ].filter(Boolean);
  if (problems.length > 0) totals.errors.push({ username, message: problems.join(", ") });

  let avatarUrl = null;
  if (profile.avatarUrl) {
    try {
      avatarUrl = (await sendPicture(api, { url: profile.avatarUrl }, `avatars/${username}`)).url;
    } catch (err) {
      if (err.status === 401) throw err;
      avatarUrl = null;
    }
  }
  try {
    await api("POST", "accounts", {
      account: {
        username,
        status: blocked ? "error" : found > 0 ? "ok" : "empty",
        error: problems.join(", ") || null,
        found,
        gone,
        displayName: profile.displayName,
        avatarUrl,
        followers: profile.followers,
        likesTotal: profile.likesTotal,
      },
    });
  } catch (err) {
    if (err.status === 401) throw err;
    // Its posts are in; only its profile line is missing. The pass goes on.
    totals.errors.push({ username, message: `profil non enregistré : ${err.message}` });
  }

  const summary = `${found} post(s) suivis, ${fresh} nouveau(x)`;
  const mark = problems.length > 0 ? red("!") : green("✓");
  log(
    `@${username} : ${summary}${problems.length ? ` - ${problems.join(", ")}` : ""}`,
    `  ${mark} @${username} ${dim(summary)}${problems.length ? ` ${red(problems.join(", "))}` : ""}`,
  );
}

/** The plan, asking again for the code if the app refuses it (revoked, mistyped). */
async function openSession() {
  let config = await ensureToken(readConfig());
  for (;;) {
    const api = makeApi(config);
    try {
      const { accounts } = await api("GET", "plan");
      return { api, accounts };
    } catch (err) {
      if (err.status !== 401 || !interactive) {
        throw err.status === 401 ? new Error(`${err.message} (config.json : ${CONFIG})`) : err;
      }
      console.log(red(`\n${err.message}`));
      config = await ensureToken({ ...config, token: "" });
    }
  }
}

async function main() {
  console.log(bold("\nPlenova Spy\n"));
  init();
  const { api, accounts } = await openSession();
  if (!accounts.length) {
    log("Aucun compte actif : ajoute-en dans l'app, Spy > Comptes.");
    return;
  }
  log(`${accounts.length} compte(s) à visiter.`, `${accounts.length} compte(s) à visiter - ça prend quelques minutes.\n`);
  const { runId } = await api("POST", "runs", { accounts: accounts.length });
  // found/added: everything, for this window; carousels: what the Spy page reports.
  const totals = { found: 0, added: 0, carousels: 0, newCarousels: 0, errors: [] };

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    saveCache();
    const report = { found: totals.carousels, added: totals.newCarousels, errors: totals.errors };
    await api("POST", `runs/${runId}`, report, { attempts: 1 }).catch((err) =>
      log(`Fin du passage non enregistrée : ${err.message}`),
    );
  };
  // The window closed or Ctrl+C: the pass is still recorded, as interrupted.
  const abort = async () => {
    totals.errors.push({ username: "*", message: "passage interrompu (fenêtre fermée)" });
    await close();
    process.exit(1);
  };
  process.once("SIGINT", abort);
  process.once("SIGHUP", abort);

  try {
    for (const [i, account] of accounts.entries()) {
      try {
        await visit(api, account, totals);
      } catch (err) {
        if (err.status === 401) throw err;
        totals.errors.push({ username: account.username, message: err.message });
        log(`@${account.username} : ${err.message}`, `  ${red("✗")} @${account.username} ${dim(err.message)}`);
      }
      if (i < accounts.length - 1) await sleep(2500 + Math.random() * 2500);
    }
  } catch (err) {
    totals.errors.push({ username: "*", message: `passage interrompu : ${err.message}`.slice(0, 300) });
    throw err;
  } finally {
    await close();
  }
  log(
    `Terminé : ${totals.found} post(s), ${totals.added} nouveau(x), ${totals.errors.length} compte(s) à vérifier.`,
    `\n${green("Terminé")} : ${totals.found} post(s) suivis, ${totals.added} nouveau(x)${
      totals.errors.length ? `, ${red(`${totals.errors.length} compte(s) à vérifier`)}` : ""
    }.\nLes hooks des nouveaux carrousels se lisent dans l'app d'ici quelques minutes.`,
  );
}

main()
  .catch((err) => {
    log(`Erreur : ${err.message}`, `\n${red("Erreur")} : ${err.message}`);
    process.exitCode = 1;
  })
  .finally(pauseBeforeClosing);
