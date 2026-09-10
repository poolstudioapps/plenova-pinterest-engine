# App TikTok — « Plenova Tool »

Fiche de référence. Tout ce qu'il faut pour reconfigurer, débugger ou reprendre
l'app TikTok du tool sans avoir à retrouver l'information ailleurs.

Dernière mise à jour : 10 septembre 2026.

---

## 1. Identité de l'app

| Champ | Valeur |
| --- | --- |
| Nom | `Plenova Tool` |
| Catégorie | Lifestyle |
| Icône | feuille verte, 1024×1024 |
| Plateforme | **Web** (case à cocher obligatoire, c'est elle qui débloque la redirect URI) |
| Portail | https://developers.tiktok.com → Manage apps |

**Description** (120 caractères max) :

```
Generate plant-care photo carousels for the Plenova houseplant app, review them, then post them to TikTok.
```

---

## 2. Les quatre URLs

Toutes servies par le tool, sur un domaine que nous contrôlons et qui est
vérifié chez TikTok.

| Usage | URL |
| --- | --- |
| **Web/Desktop URL** (site officiel) | `https://studio.latelierugc.com` |
| Redirect URI (Login Kit) | `https://studio.latelierugc.com/api/tiktok/callback` |
| Terms of Service | `https://studio.latelierugc.com/legal/terms` |
| Privacy Policy | `https://studio.latelierugc.com/legal/privacy` |

> Ne pas confondre les deux premières. **Web/Desktop URL** attend la page
> d'accueil du service, pas un endpoint. C'est aussi l'URL à laquelle les
> guidelines font référence lorsqu'elles exigent que le domaine visible dans la
> vidéo de démo corresponde au site déclaré — donc celle que tu filmeras.
>
> La page d'accueil est l'écran de connexion : il présente l'outil et renvoie
> vers les deux pages légales, pour qu'un reviewer qui l'ouvre comprenne
> immédiatement de quoi il s'agit.

Les deux pages légales sont générées par le tool (`app/legal/`) et restent
**publiques** malgré la protection par mot de passe — les reviewers TikTok
doivent pouvoir les lire sans être connectés. La liste blanche est dans
`lib/auth.ts` (`PUBLIC_PREFIXES`).

> La redirect URI doit être **identique au caractère près** entre le portail
> TikTok et la variable d'environnement. C'est la cause n°1 des échecs OAuth, et
> le message d'erreur renvoyé n'est jamais explicite.

---

## 3. Produits et scopes

| Produit | Réglage |
| --- | --- |
| Login Kit | activé, configuré pour le Web |
| Content Posting API | activé, **Direct Post : ON** |

| Scope | Rôle |
| --- | --- |
| `user.info.basic` | lire le profil du compte connecté (open id, avatar, nom) |
| `video.publish` | publication directe sur le profil |
| `video.upload` | envoi en brouillon, à finir dans TikTok |

⚠️ Les deux scopes de publication étant demandés, **la vidéo de démo doit montrer
les deux parcours**. Sinon la revue traîne ou est refusée.

---

## 4. Vérification de domaine

Requise pour `pull_by_url`, seul mode possible pour les carrousels photo.

| | |
| --- | --- |
| Type de propriété | **Domain** (méthode : enregistrement DNS) |
| Domaine vérifié | `latelierugc.com` — **la racine**, pas un sous-domaine |
| Enregistrement | TXT sur `@` |
| Valeur | `tiktok-developers-site-verification=a3IswrlIjW5L8ExDQBTno0gFVozFpSrt` |

Vérifier la racine couvre automatiquement **tous** les sous-domaines, présents et
futurs : `studio.`, `media.`, etc. À ne faire qu'une fois.

L'autre option du portail — « URL prefix » via fichier de signature — impose
d'héberger un fichier et ne couvre pas les sous-domaines. À éviter.

### Où poser les enregistrements

**Pas chez Hostinger.** Hostinger n'est que le registrar : les serveurs de noms
pointent vers Cloudflare.

```
latelierugc.com → ned.ns.cloudflare.com
                  mina.ns.cloudflare.com
```

Tout se fait donc sur **dash.cloudflare.com** → `latelierugc.com` → DNS → Records.
Une zone DNS existe aussi chez Hostinger, mais elle est **inactive** — c'est le
piège classique.

---

## 5. DNS du domaine

| Type | Name | Valeur | Proxy |
| --- | --- | --- | --- |
| TXT | `@` | la valeur de vérification ci-dessus | — |
| CNAME | `studio` | `fef6eb5b702cc675.vercel-dns-016.com` | **DNS only (gris)** |

Le nuage Cloudflare doit être **gris**. En orange, Vercel ne peut pas valider le
domaine ni émettre son certificat, et l'échec est silencieux.

L'ancienne cible `cname.vercel-dns.com` fonctionne toujours ; Vercel recommande
simplement la nouvelle depuis l'élargissement de sa plage d'IP.

`media.latelierugc.com` reste sur le tunnel Cloudflare et **ne doit pas être
touché** — c'est lui qui fait vivre l'ancien outil.

---

## 6. Variables d'environnement

À poser dans Vercel (Production **et** Preview), jamais dans le repo.

```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=https://studio.latelierugc.com/api/tiktok/callback
```

Les valeurs se trouvent dans le portail TikTok, onglet **Configurer → Clés API**.

> Les variables ne sont injectées qu'au build : **redéployer** après toute
> modification, sinon le déploiement en cours ne les verra jamais.

---

## 7. Détails techniques de l'API

Extraits de l'implémentation qui fonctionne déjà (`carousel-studio`), à
reproduire à l'identique.

### Endpoints

| Usage | URL |
| --- | --- |
| Autorisation | `https://www.tiktok.com/v2/auth/authorize/` |
| Jeton | `POST https://open.tiktokapis.com/v2/oauth/token/` |
| Profil | `GET /v2/user/info/` |
| Infos créateur | `POST /v2/post/publish/creator_info/query/` |
| Init publication | `POST /v2/post/publish/content/init/` |
| Statut | `POST /v2/post/publish/status/fetch/` |

### Piège PKCE

TikTok attend `code_challenge` en **hexadécimal** de SHA256(verifier), **pas** en
base64url comme la quasi-totalité des implémentations OAuth. C'est une
spécificité TikTok, et une erreur ici produit un échec sans message clair.

### Corps de publication d'un carrousel

```json
{
  "media_type": "PHOTO",
  "post_mode": "MEDIA_UPLOAD",
  "post_info": { "title": "…", "description": "…" },
  "source_info": {
    "source": "PULL_FROM_URL",
    "photo_cover_index": 1,
    "photo_images": ["https://…", "https://…"]
  }
}
```

- `post_mode` : `MEDIA_UPLOAD` pour un brouillon, `DIRECT_POST` pour publier.
- `photo_cover_index` est **indexé à partir de 1**, pas de 0.
- `title` : 90 caractères max. `description` : 4000 max.
- **TikTok ne supporte pas `FILE_UPLOAD` pour les photos**, uniquement pour la
  vidéo. D'où `PULL_FROM_URL`, et donc l'obligation de vérifier le domaine.

### Ce qu'impose Direct Post

Documenté et audité. Avant chaque publication directe, le tool doit :

1. appeler `creator_info/query` ;
2. afficher les **options de confidentialité** renvoyées et respecter le choix
   de l'utilisateur (`privacy_level` doit correspondre à une des valeurs
   retournées) ;
3. exposer les bascules **contenu de marque / contenu organique**.

> « All clients are required to correctly display the creator account's privacy
> level options and honor the users' choice. »

Sans cette interface, la revue est refusée.

### Limites

- ~300 requêtes/minute par utilisateur, ~1000 écritures/jour.
- Pas d'endpoint de publication par lot : un appel par carrousel.

---

## 7 bis. Sandbox — obligatoire avant approbation

Une app jamais approuvée ne peut pas faire d'OAuth avec ses identifiants de
production. La tentative échoue avec :

> Something went wrong — correct the following and try again: **client_key**

Le message pointe vers la clé, alors que la clé est correcte. C'est
l'environnement qui est refusé.

### Créer le sandbox

Étapes officielles, portail développeur :

1. **Manage apps**, sélectionner l'app
2. **Basculer le toggle situé à côté du nom de l'app sur « Sandbox »**
   (c'est un interrupteur, pas une entrée de menu — d'où la difficulté à le
   trouver)
3. **Create Sandbox**, lui donner un nom
4. Cloner la configuration depuis la production, pour récupérer redirect URI,
   produits et scopes sans tout ressaisir
5. Vérifier **App details** et les produits, puis **Apply changes**

Jusqu'à 5 sandboxes par app.

### Autoriser ton compte

Dans le sandbox, section **Target users** : ajouter le compte TikTok de Plenova.
Jusqu'à 10 comptes. Seuls ces comptes peuvent se connecter en sandbox.

### Identifiants

Le sandbox expose ses **propres Client Key et Client Secret**, distincts de la
production. Il faut donc poser **les clés du sandbox** dans les variables Vercel
le temps des tests et de la vidéo de démo, puis repasser sur les clés de
production une fois l'app approuvée.

> À vérifier au premier passage : si le sandbox n'affiche pas de clés propres,
> conserver celles de production. La documentation publique n'est pas explicite
> sur ce point.

### Passage en production

Une fois satisfait, importer la configuration du sandbox vers un **Draft** de
l'app en mode Production, et soumettre depuis là.

---

## 8. Soumission à la revue

**Bloquant : une vidéo de démo est obligatoire.** Le code doit donc exister et
fonctionner avant toute soumission.

Contraintes du portail :

- mp4 ou mov, 5 fichiers max, 50 Mo chacun
- l'app n'ayant jamais été approuvée, la démo doit passer par
  l'**environnement sandbox** du portail
- **le domaine visible dans la vidéo doit correspondre à l'URL déclarée** →
  `studio.latelierugc.com` doit rester lisible dans la barre d'adresse
- tous les produits et scopes cochés doivent être démontrés à l'écran

### Plan de tournage

1. Connexion au tool sur `studio.latelierugc.com`
2. Connexion du compte TikTok → autorisation → retour sur le tool
3. Génération d'un carrousel, interactions visibles
4. Écran de pré-publication : avatar, sélecteur de confidentialité, bascules
5. **Publication directe** → démontre `video.publish`
6. Second carrousel **en brouillon** → démontre `video.upload`

### Texte de revue

```
Plenova Tool is our internal studio for Plenova, a houseplant care app.
It generates plant-care photo carousels and posts them to our own
TikTok account.

Login Kit / user.info.basic: connect our account and show the operator
which account will receive the post.

video.publish: post reviewed carousels directly. We query creator_info
first to render the avatar, the privacy level options and the branded
content toggles, then send the operator's choice as privacy_level.

video.upload: send the carousel to drafts instead, when the operator
wants to finish it inside TikTok.

Images are pulled by TikTok from a domain we own and have verified.
```

---

## 9. Ne pas casser l'ancien outil

`carousel-studio` (bureau) continue de tourner en parallèle. Il utilise :

- une **app TikTok différente**, avec ses propres clés ;
- la redirect URI `http://localhost:3000/tiktok/callback` ;
- `media.latelierugc.com` via tunnel Cloudflare pour servir ses images.

Les deux apps cohabitent sans conflit tant que **`media.latelierugc.com` n'est
pas basculé vers Vercel**. C'est la seule action qui casserait l'ancien outil.

---

## 10. État au 10 septembre 2026

| Élément | État |
| --- | --- |
| App créée, Web coché | ✅ |
| Login Kit + Content Posting API | ✅ |
| Direct Post activé | ✅ |
| 3 scopes demandés | ✅ |
| Redirect URI enregistrée | ✅ |
| Web/Desktop URL déclarée | ✅ |
| Domaine `latelierugc.com` vérifié | ✅ |
| `studio.latelierugc.com` en ligne (HTTPS, TLS valide) | ✅ |
| Pages légales publiques et lisibles | ✅ |
| Intégration TikTok dans le tool | ✅ OAuth PKCE, creator_info, publication directe + brouillon |
| Onglets TikTok et Carrousels | ✅ |
| Variables d'environnement TikTok | ✅ posées et déployées |
| Sandbox créé + target user ajouté | ⬜ **requis pour se connecter** |
| Vidéo de démo | ⬜ nécessite le code |
| Soumission | ⬜ **ne pas soumettre avant la vidéo** |
