/**
 * Builds the "Plenova Spy" folder - the spy, ready to hand to anyone.
 *
 *   npm run spy:kit                                     dist/Plenova Spy + its zip
 *   npm run spy:kit -- --install="C:\Dev\Plenova Spy"   also updates that folder
 *   npm run spy:kit -- --code="PC du bureau"            an access code for THIS computer
 *
 * The folder carries its own node.exe (a copy of the one running this), so the
 * computer it lands on needs nothing installed: double-click "Lancer le
 * spy.bat" and it runs.
 *
 * No folder ever holds an access code. Each computer keeps its own in the
 * Windows user's profile (%APPDATA%\Plenova Spy\config.json, read by
 * scripts/spy-agent.mjs), so any copy of the folder - the zip, or the folder
 * someone uses every day - can be sent as it is.
 *
 * --install updates a folder in place: its logs and cache stay. A code still
 * in a folder's config.json (folders made before 2026-09-27) moves to this
 * computer's profile.
 * --code creates an access code in the app's database, with the Supabase key
 * from .env.local, and stores it in this computer's profile. It is never
 * printed.
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const KIT = path.join(DIST, "Plenova Spy");
/** What goes into the zip: a fresh folder, without logs or cache. */
const STAGE = path.join(DIST, ".zip-staging");
const SERVER = "https://studio.latelierugc.com";
const USER_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, "Plenova Spy")
  : path.join(os.homedir(), ".plenova-spy");
const SECRET = path.join(USER_DIR, "config.json");

const option = (name) => {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  return raw
    ? raw
        .slice(name.length + 3)
        .trim()
        .replace(/^"(.*)"$/, "$1")
    : undefined;
};
const codeName = option("code");
const install = option("install") ? path.resolve(option("install")) : undefined;

function hasSecret() {
  try {
    const token = JSON.parse(fs.readFileSync(SECRET, "utf8")).token;
    return typeof token === "string" && token.startsWith("spy_");
  } catch {
    return false;
  }
}

function saveSecret(token) {
  fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(SECRET, JSON.stringify({ token }, null, 2));
}

const LAUNCHER = [
  "@echo off",
  "chcp 65001 >nul",
  "title Plenova Spy",
  'cd /d "%~dp0"',
  // Opened straight from the zip, or the .bat copied alone: say what is missing.
  'if not exist "%~dp0app\\node.exe" (',
  '  echo Il manque le dossier "app" a cote de ce fichier.',
  '  echo Garde tout le dossier "Plenova Spy" ensemble ^(dezippe-le en entier : clic droit ^> Extraire tout^),',
  '  echo puis relance "Lancer le spy.bat" depuis ce dossier.',
  "  pause",
  "  exit /b 1",
  ")",
  '"%~dp0app\\node.exe" "%~dp0app\\spy.mjs" %*',
  "",
].join("\r\n");

const README = `PLENOVA SPY
===========

Ce dossier relève ce que publient les comptes TikTok suivis dans l'app et
l'envoie à Plenova Studio : carrousels des concurrents (Spy > Comptes), stats
de nos propres comptes (page Versus : Mr Stark, Mr Mousk).

CE QU'IL Y A DANS CE DOSSIER
----------------------------
- « Lancer le spy.bat » : double-clic pour lancer un passage.
- « app » : le programme (rien à y toucher, rien à installer).
- « config.json » : l'adresse de l'app. Aucun code secret dedans.
- « logs » : le détail de chaque passage (créé au premier lancement).
Garde toujours le dossier entier : le .bat tout seul ne marche pas.

LANCER
------
Double-clic sur « Lancer le spy.bat ». Une fenêtre s'ouvre, visite les
comptes un par un (quelques minutes), puis affiche « Terminé ».

Au premier lancement sur un ordinateur, la fenêtre demande le code d'accès
de cet ordinateur : dans l'app, Spy > Comptes > Ordinateurs > « Autoriser un
ordinateur ». Il est retenu sur cet ordinateur (dans le profil Windows, pas
dans ce dossier).

Si Windows affiche « Windows a protégé votre ordinateur » : « Informations
complémentaires » puis « Exécuter quand même » (une seule fois).

LE LANCER DEPUIS L'APP
----------------------
Après ce premier double-clic, le bouton « Lancer le spy » de l'app (page Spy)
lance ce dossier tout seul. Chrome demande alors « Ouvrir Plenova Spy ? » :
coche « Toujours autoriser » puis « Ouvrir ». Si tu déplaces le dossier,
refais un double-clic ici pour que le bouton le retrouve.

PARTAGER LE DOSSIER
-------------------
Le dossier ne contient aucun code : envoie-le tel quel (zippé). Pour l'autre
personne, crée-lui un code dans l'app (Spy > Comptes > Ordinateurs >
« Autoriser un ordinateur ») et envoie-le-lui à part : le spy le demandera à
son premier lancement. Chaque ordinateur a son propre code : on peut en
couper un sans toucher aux autres.

AJOUTER OU RETIRER DES COMPTES
------------------------------
Dans l'app uniquement : Spy > Comptes pour les concurrents, page Versus pour
nos comptes. Le spy relit la liste à chaque lancement : un compte ajouté dans
l'app est visité dès le passage suivant, sur n'importe quel ordinateur.

LE LANCER TOUS LES JOURS (FACULTATIF)
-------------------------------------
Planificateur de tâches Windows > Créer une tâche de base > Quotidienne >
Démarrer un programme : « Lancer le spy.bat » de ce dossier, avec l'argument
--no-pause (la fenêtre se ferme toute seule à la fin).

EN CAS DE SOUCI
---------------
Le détail de chaque passage est dans le dossier « logs ». « Code d'accès
refusé » : le code a été révoqué ; crées-en un nouveau dans l'app et relance
le spy par un double-clic, il le redemandera.

Le spy ne relit pas tout à chaque fois : il prend les posts qu'il n'a pas
encore, et remet à jour les chiffres de ceux publiés la semaine d'avant (le
mois d'avant pour nos comptes).
`.replace(/\n/g, "\r\n");

/** Writes the spy into `dir`. Its logs and cache are left alone; its config.json holds no code. */
function writeKit(dir) {
  const app = path.join(dir, "app");
  fs.mkdirSync(app, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, "scripts", "spy-agent.mjs"),
    path.join(app, "spy.mjs"),
  );
  // ESM without a package.json around it needs to say so.
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2),
  );
  // The same node.exe already there is left alone: an open spy window keeps
  // it locked, and there is nothing to update.
  const nodeExe = path.join(app, "node.exe");
  const same = (() => {
    try {
      return fs.statSync(nodeExe).size === fs.statSync(process.execPath).size;
    } catch {
      return false;
    }
  })();
  try {
    if (!same) fs.copyFileSync(process.execPath, nodeExe);
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      throw new Error(
        `${path.join(app, "node.exe")} est utilisé : ferme la fenêtre du spy puis relance.`,
      );
    }
    throw err;
  }
  fs.writeFileSync(path.join(dir, "Lancer le spy.bat"), LAUNCHER);
  fs.writeFileSync(path.join(dir, "LISEZ-MOI.txt"), README);

  const configFile = path.join(dir, "config.json");
  let previous = {};
  try {
    previous = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    // No folder there yet.
  }
  let moved = false;
  if (
    typeof previous.token === "string" &&
    previous.token.startsWith("spy_") &&
    !hasSecret()
  ) {
    saveSecret(previous.token);
    moved = true;
  }
  fs.writeFileSync(configFile, JSON.stringify({ server: SERVER }, null, 2));
  return moved;
}

const moved = [writeKit(KIT), install ? writeKit(install) : false].some(
  Boolean,
);

// The zip, for sending: a fresh copy, so no logs or cache of this computer.
const zip = path.join(DIST, "Plenova Spy.zip");
fs.rmSync(STAGE, { recursive: true, force: true });
writeKit(path.join(STAGE, "Plenova Spy"));
fs.rmSync(zip, { force: true });
try {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${path.join(STAGE, "Plenova Spy")}' -DestinationPath '${zip}' -Force`,
    ],
    { stdio: "inherit" },
  );
} finally {
  fs.rmSync(STAGE, { recursive: true, force: true });
}

if (codeName) {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    },
  );
  const token = `spy_${randomBytes(24).toString("base64url")}`;
  const { error } = await db.from("spy_agents").insert({
    id: `agt_${randomBytes(8).toString("base64url")}`,
    name: codeName.slice(0, 60),
    token_hash: createHash("sha256").update(token).digest("hex"),
  });
  if (error) throw new Error(`création du code d'accès : ${error.message}`);
  saveSecret(token);
}

console.log(`Dossier : ${KIT}`);
if (install) console.log(`Installé : ${install}`);
console.log(`Zip     : ${zip}`);
if (moved)
  console.log(
    "Code d'accès de ce PC déplacé du dossier vers le profil Windows.",
  );
if (codeName)
  console.log(`Code d'accès « ${codeName} » créé pour ce PC (profil Windows).`);
console.log(
  hasSecret()
    ? "Ce PC a son code d'accès."
    : "Ce PC n'a pas encore de code : le spy le demandera.",
);
