/**
 * Builds the "Plenova Spy" folder - the spy, ready to hand to anyone.
 *
 *   npm run spy:kit                          folder without an access code
 *   npm run spy:kit -- --code="PC du bureau"  creates that code and puts it in
 *
 * Out: dist/Plenova Spy/ and dist/Plenova Spy.zip. The folder carries its own
 * node.exe (a copy of the one running this), so the computer it lands on needs
 * nothing installed: double-click "Lancer le spy.bat" and it runs.
 *
 * --code creates an access code in the app's database, with the Supabase key
 * from .env.local, and writes it into the folder's config.json. It is never
 * printed. Without it, a rebuild keeps the code the folder already had, and a
 * first build has none: the spy asks for one on its first launch.
 *
 * The zip never carries a code, whatever the folder has: it is the copy that
 * gets sent around, and each computer should get its own.
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const KIT = path.join(DIST, "Plenova Spy");
const APP = path.join(KIT, "app");
const SERVER = "https://studio.latelierugc.com";

const codeName = process.argv.find((a) => a.startsWith("--code="))?.slice("--code=".length).trim();

// This computer's code survives a rebuild.
let token = "";
try {
  const previous = JSON.parse(fs.readFileSync(path.join(KIT, "config.json"), "utf8"));
  if (typeof previous.token === "string") token = previous.token;
} catch {
  // First build: no folder yet.
}

fs.rmSync(KIT, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });

fs.copyFileSync(path.join(ROOT, "scripts", "spy-agent.mjs"), path.join(APP, "spy.mjs"));
// ESM without a package.json around it needs to say so.
fs.writeFileSync(path.join(APP, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2));
fs.copyFileSync(process.execPath, path.join(APP, "node.exe"));

fs.writeFileSync(
  path.join(KIT, "Lancer le spy.bat"),
  [
    "@echo off",
    "chcp 65001 >nul",
    "title Plenova Spy",
    'cd /d "%~dp0"',
    // Opened straight from the zip, the folder is not really there: say so.
    'if not exist "%~dp0app\\node.exe" (',
    '  echo Dezippe d\'abord tout le dossier "Plenova Spy" ^(clic droit ^> Extraire tout^),',
    '  echo puis relance "Lancer le spy.bat" depuis le dossier extrait.',
    "  pause",
    "  exit /b 1",
    ")",
    '"%~dp0app\\node.exe" "%~dp0app\\spy.mjs" %*',
    "",
  ].join("\r\n"),
);

if (codeName) {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  token = `spy_${randomBytes(24).toString("base64url")}`;
  const { error } = await db.from("spy_agents").insert({
    id: `agt_${randomBytes(8).toString("base64url")}`,
    name: codeName.slice(0, 60),
    token_hash: createHash("sha256").update(token).digest("hex"),
  });
  if (error) throw new Error(`création du code d'accès : ${error.message}`);
}
const writeConfig = (value) =>
  fs.writeFileSync(path.join(KIT, "config.json"), JSON.stringify({ server: SERVER, token: value }, null, 2));
writeConfig("");

fs.writeFileSync(
  path.join(KIT, "LISEZ-MOI.txt"),
  `PLENOVA SPY
===========

Ce dossier relève chaque jour ce que publient les comptes TikTok suivis dans
l'app et l'envoie à Plenova Studio : carrousels des concurrents (Spy >
Comptes), stats de nos propres comptes (page Versus : Mr Stark, Mr Mousk).

LANCER
------
Double-clic sur « Lancer le spy.bat ». Une fenêtre s'ouvre, visite les
comptes un par un (quelques minutes), puis affiche « Terminé ». Rien à
installer : tout ce qu'il faut est dans le dossier « app ».

Au premier lancement, si aucun code n'est déjà dans config.json, la fenêtre
demande un code d'accès : dans l'app, Spy > Comptes > Ordinateurs >
« Autoriser un ordinateur ». Il est retenu pour les fois suivantes.

Si Windows affiche « Windows a protégé votre ordinateur » : « Informations
complémentaires » puis « Exécuter quand même » (une seule fois).

AJOUTER OU RETIRER DES COMPTES
------------------------------
Dans l'app uniquement : Spy > Comptes pour les concurrents, page Versus pour
nos comptes. Le spy relit la liste à chaque
lancement : un compte ajouté dans l'app est visité dès le passage suivant, sur
n'importe quel ordinateur.

PARTAGER LE DOSSIER
-------------------
Chaque ordinateur a son propre code d'accès (on peut ainsi en couper un sans
toucher aux autres). Pour une autre personne : crée-lui un code dans l'app
(Spy > Comptes > Ordinateurs > « Autoriser un ordinateur »), envoie-lui le
dossier et le code ; le spy le demandera au premier lancement.

Si tu copies ce dossier-ci, vide d'abord la valeur "token" de config.json
(laisse les guillemets : "token": "") pour ne pas donner ton propre code.

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
mois d'avant pour nos comptes). Le premier passage après l'ajout de
l'historique d'un compte peut prendre une demi-heure.
`.replace(/\n/g, "\r\n"),
);

// The zip, for sending - without a code; the folder gets its own back whatever happens.
const zip = path.join(DIST, "Plenova Spy.zip");
try {
  fs.rmSync(zip, { force: true });
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${KIT}' -DestinationPath '${zip}' -Force`],
    { stdio: "inherit" },
  );
} finally {
  writeConfig(token);
}

console.log(`Dossier : ${KIT}`);
console.log(`Zip     : ${zip}`);
console.log(
  codeName
    ? `Code d'accès « ${codeName} » créé et placé dans le dossier (pas dans le zip).`
    : token
      ? "Code d'accès du dossier conservé (le zip, lui, n'en a pas)."
      : "Sans code : il sera demandé au premier lancement.",
);
