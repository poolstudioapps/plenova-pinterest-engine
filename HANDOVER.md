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

## 2. État en ce moment (24/09)

- **Serveur local** sur <http://localhost:3000> (`npm run dev:offline`). Il doit
  rester allumé, l'utilisateur suit en direct. Données locales dans
  `.data/state.json` : les 3 images CTA de l'utilisateur et un carrousel en
  échec qu'il a lancé lui-même (« Top 4 des plus belles Monstera ») — ne pas
  les supprimer.
- Tout ce qui était dans la file ci-dessous est livré, testé, poussé et en
  production (studio.latelierugc.com).

## 3. Ce qui reste

- ~~Site URL Supabase~~ : réglé par l'utilisateur le 25/09 (le lien du mail
  pointe sur `studio.latelierugc.com`, vérifié dans les `edge_logs`). Si le
  lien repart vers localhost, c'est ce réglage (Authentication > URL
  Configuration), pas le code.
- Régénérer les secrets passés dans le chat (TikTok client secret, PAT
  Supabase). Supprimer éventuellement le projet Vercel en double
  `plenova-pinterest-engine` (le vrai est `-9htq`).
- Idée non faite : choisir une slide prête (CTA) dès la génération d'un
  carrousel, au lieu de l'insérer ensuite dans l'éditeur.

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

**L'éditeur tient le carrousel entier en brouillon.** Chaque slide a un `uid`
stable et un `from` (sa position enregistrée, `null` si nouvelle). Ajouter,
dupliquer, retirer, réordonner sont des éditions comme les autres (Ctrl+Z), et
un seul `PUT /api/carousels/[id]/slides` écrit tout. Le serveur garde un
composite par langue si texte, mise en page et photo sont inchangés, fait
suivre la couverture, et **refuse (409)** si le carrousel a changé ailleurs
(`expectedLength` + empreinte de la photo à `from`). L'historique survit à
l'enregistrement grâce à l'action `rebase`.

**Slides prêtes** (`SlideTemplate`, table Supabase `slide_templates`, clé
`slideTemplates` en local) : photo de la bibliothèque + mise en page + textes
par langue (les 5). Traduction Gemini des langues vides seulement.

**Les menus flottants passent par un portal** (`components/ui/Menu.tsx`, comme
`Picker`) : un menu dans une carte `overflow-hidden` se faisait couper.

**Le glisser-déposer mesure la mise en page, jamais un rectangle animé**
(`components/ui/Sortable.tsx`, `restBox` = offsetLeft/Top). Mesurer
`getBoundingClientRect` pendant une transition faisait fuir la vignette.

**Une slide peut n'avoir aucun texte.** Titre retiré, CTA seul, photo nue :
c'est un choix, rien ne le signale. L'éditeur ne signale qu'une traduction
manquante (un bloc écrit dans une langue et vide dans une autre). Suppr retire
le bloc sélectionné dans toutes les langues, ou la slide si sa vignette a le
focus clavier (anneau visible).

**Après une modification, seules les slides touchées sont réincrustées**, et
automatiquement, dès que la page Carrousels est ouverte (`compose(c, "stale")`).
L'ancien message « les slides n'ont pas encore de texte » s'affichait pendant
cette réincrustation et faisait croire à une erreur.

**La voix des textes générés** (`lib/voice.ts`) : une influenceuse plantes qui
parle à sa communauté. Première personne, tutoiement (tu, du, tú, tu), accords
au féminin, jamais de fiche produit. Demandé explicitement par l'utilisateur ;
partagée par tous les prompts (carrousel, légende, repost, traduction des
slides prêtes, Pins).

**La plante 3D** (`components/plants/monstera-scene.ts`, three.js en chunk
chargé à la demande) : aucun fichier téléchargé, tout est modélisé en code.

## 5. Connexion — comment ça marche

Adresse e-mail sur allowlist, puis le lien du mail (ou le code, 6 à 10 chiffres, s'il y en a un). « Se déconnecter » en bas de la barre latérale (POST `/api/auth/logout`).

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
| Projet Vercel | **`plenova-pinterest-engine-9htq`** (`prj_BgNH5jleYQ9uWXQFpJFRtVlutsuC`), scope CLI `pool-studios` |
| ⚠️ Doublon | `plenova-pinterest-engine` (`prj_QTPv…`) est un projet **vide** qui déploie le même repo. Il ne sert PAS le domaine. Une variable posée dessus n'a aucun effet en prod — c'est arrivé. Vérifier avec `vercel alias ls \| grep studio.latelierugc`. |
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
