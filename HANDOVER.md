# Passation — Plenova Studio

Note écrite pour la reprise après un changement de modèle. Elle dit où en est
le travail, ce qui est décidé et **pourquoi**, et les pièges qui ont coûté cher
à trouver. Supprime-la quand elle n'a plus d'utilité.

Dernier commit : `a6a7ae0`. Tout est poussé sur `main`, rien en attente.

---

## 1. Le contexte en cinq lignes

Plenova Studio (`C:\Dev\plenova-pinterest-engine`) est un outil **interne**, un
seul opérateur francophone. Il génère des pins Pinterest et des carrousels
photo TikTok sur les plantes d'intérieur, via Gemini. Prod :
<https://studio.latelierugc.com>, déployée depuis `main` sur Vercel.

**Ne jamais toucher** à `C:\Dev\ProjectKing` (projet Unreal, c'est le dossier
de travail de la session) ni à l'ancien projet Plenova. Seul
`plenova-pinterest-engine` est modifiable.

## 2. État en ce moment

- **Serveur local** sur <http://localhost:3000> (`npm run dev:offline`). Il doit
  rester allumé, l'utilisateur suit en direct.
- **Un workflow tourne** : `wdeutpfdm` — 7 agents remplacent les `<Select>`
  natifs restants par `<Picker>`, un fichier chacun. Lancés, aucun rendu au
  moment d'écrire. Journal :
  `…/subagents/workflows/wf_fcd037dd-8c9/journal.jsonl`.
  Il finit par une relecture qui lance `npm run build` et vérifie le dialogue
  de publication TikTok. **Lis son résultat avant de toucher à
  `components/generate|library|media|tiktok/*`.**

## 3. La file d'attente, dans l'ordre convenu

1. ~~Remplacer les `<select>` restants~~ → workflow en cours
2. **Logo SVG** — `components/layout/PlenovaMark.tsx`. L'utilisateur dit que
   « ça crop un morceau ». Refait à la main d'après son PNG, les courbes de la
   feuille sont approximatives. Il y a une page de comparaison prête :
   `…/scratchpad/mark.html` avec trois variantes (A actuelle, B pli en coin,
   C pli au trait). **Rendre les variantes et regarder avant de choisir.**
3. **Espèces inconnues → catégorie Hook/Outro** dans la bibliothèque d'images,
   pour servir de première image aux carrousels repostés. **Plus** un upload
   d'images CTA par l'opérateur (il en a 3 prêtes).
4. **Repost** : trier les captures par date (plus ancienne → plus récente),
   afficher les vignettes dessous, réordonner en drag and drop. Et « le drag
   and drop doit globalement fonctionner partout où il est nécessaire ».
5. **Éditeur de slide avancé** — le gros morceau, explicitement demandé
   « hyper fonctionnel et avancé ». `components/tiktok/SlideEditor.tsx`.
6. **Animations** — l'utilisateur veut du 3D réactif à la souris, gratuit, sur
   le thème végétal. **Une question lui a été posée et il n'a pas répondu** :
   Three.js pèse des centaines de Ko sur un outil interne, et les Lottie
   botaniques vraiment libres sont rares et médiocres ; proposition de SVG
   animés maison à la place. **Ne pas engager de travail lourd sans sa
   réponse.**

## 4. Décisions déjà prises — ne pas les défaire par inadvertance

**`Locale` n'existe plus, `ContentLocale` est vital.** L'interface est en
français seul. Mais `ContentLocale` (`fr en es de it`) est ce dans quoi un pin
ou un carrousel est **rédigé** : c'est la raison d'être de l'outil. Les deux
noms se ressemblent ; un nettoyage distrait de « Locale » tue la publication
multilingue. C'est écrit dans `lib/i18n.ts` et dans `README.md`.

**Le dictionnaire FR est la source des clés.** `TranslationKey = keyof typeof
FR`. Une clé appelée mais absente est une erreur de compilation, pas un texte
brut à l'écran. `translator()` ne prend plus d'argument et son identité est
stable — un retour à une fonction recréée à chaque rendu avait provoqué une
boucle d'effets sans fin et un rate limit TikTok permanent.

**Les composites ne vont pas dans la bibliothèque d'images.** Une photo avec
« Top 5 des pothos rares » gravé dessus n'est réutilisable pour rien. Le
composite reste sur le carrousel (`slide.composed[lang]`), c'est lui qu'on
publie. 16 lignes polluantes ont été supprimées en base.

**`hostImageAt` est le point de passage unique de toute image stockée.** Le
nettoyage des métadonnées (`lib/image-metadata.ts`) y est branché exprès :
enregistrement, recomposition, capture de repost et republication y passent
tous. Les profils ICC sont **gardés** (les retirer déplace les couleurs).

**Le portail de production ne s'ouvre jamais sans session.** Avant, il
s'ouvrait dès que `ADMIN_PASSWORD` manquait. Hors production il reste ouvert,
c'est localhost.

**Le panneau des pickers passe par un portal en coordonnées de page.** La carte
du studio est en `overflow-hidden` — mesuré, pas supposé. Une version en
`position: fixed` + écouteur de scroll ne suivait pas le défilement.

**Les hashtags sont plafonnés en code**, pas seulement dans le prompt :
`normaliseHashtags` dans `lib/carousel.ts`, 5 max, `#planttok` garanti.

## 5. Connexion — comment ça marche

Adresse e-mail sur allowlist + code à 6 chiffres.

- `allowed_emails` dans Supabase (projet `snlehcwteclikxhqgvqs`), **RLS activé
  sans aucune policy** : seul le rôle service y accède, donc le serveur et le
  propriétaire dans le dashboard. Trois adresses inscrites.
- **Le code appartient à Supabase Auth** : génération, envoi, expiration, usage
  unique, limitation de débit. Pas de fournisseur tiers, pas de table à nous.
  La table `login_codes` a été créée puis supprimée quand on a basculé.
- L'allowlist est consultée **avant** que Supabase soit sollicité, donc une
  adresse non autorisée ne reçoit jamais rien. Et **re-vérifiée** à la saisie du
  code, pour qu'une révocation prenne effet tout de suite.
- Session : cookie HMAC `<expiration>.<email>.<signature>`, les deux dans la
  charge signée.

**⚠️ Une case reste à cocher côté Supabase** : le gabarit d'e-mail doit
contenir `{{ .Token }}`, sinon il n'envoie qu'un lien et pas de code.
L'utilisateur n'a pas confirmé l'avoir fait. **À vérifier avec lui avant de
déboguer quoi que ce soit sur la connexion.**

## 6. Environnement et accès

| Quoi | Où |
| --- | --- |
| Projet Vercel | `prj_QTPvGoFeNBTHUmNwWI4eNVkbRplq`, scope CLI `pool-studios` |
| Projet Supabase | `snlehcwteclikxhqgvqs` (`plenova-studio`) |
| CLI Vercel | **authentifié**, le checkout est lié (`.vercel/`) |
| MCP Vercel | `create_project_env` refuse le format de `requestBody` — passer par le CLI |
| MCP Supabase | fonctionne (SQL, migrations). Pas d'outil pour la config Auth. |
| Secrets déchiffrés | refusés par le classifieur — ne pas contourner |

`npm run dev:offline` neutralise `SUPABASE_*`, `BLOB_*` et `ADMIN_PASSWORD` et
bascule sur `.data/`. **C'est important** : un test local contre la base
partagée a déjà écrit 28 Mo d'images en clair et fait tomber le site.

## 7. Pièges déjà payés

- **Ne pas lancer un serveur avec `| head`** : le pipe ferme stdout et tue le
  serveur (SIGPIPE). Rediriger vers un fichier.
- `taskkill //F //IM node.exe` pour nettoyer les serveurs zombies sous Git Bash.
- Les heredocs Bash cassent sur les gros blocs Python/TS : écrire le script
  avec l'outil Write puis l'exécuter.
- `lib/validation.ts` contenait de vrais octets NUL dans une regex, ce qui le
  rendait binaire pour git. Corrigé — ne pas réintroduire.
- Les captures d'écran du panneau navigateur échouent souvent au premier essai.
  Réessayer une fois, ou utiliser `get_page_text` / `javascript_tool`.
- La fenêtre du panneau fait ~571 px de haut : les pickers s'y retournent vers
  le haut, c'est **normal**, pas un bug.

## 8. Ton de travail attendu

L'utilisateur va vite, empile les demandes et veut voir le résultat en direct.
Il apprécie qu'on vérifie vraiment plutôt qu'on affirme : les corrections de
cette session ont toutes été testées (hashtags sur 7 cas, troncature emoji,
contournement de la porte sur 7 chemins, OTP de bout en bout). Il corrige
volontiers — « ça crop », « les menus sont laids », « check que le picker sorte
des containers » — et ces remarques étaient toutes justes. Les commits sont en
français, détaillés, et disent pourquoi.
