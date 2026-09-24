/**
 * Language.
 *
 * Two different concerns used to share this module. Only one is left.
 *
 *  1. The dashboard is French, and only French. There is one operator and they
 *     are French-speaking, so a second interface language was a dictionary to
 *     keep in sync for nobody's benefit - and a switcher that could strand the
 *     tool in a language its owner did not ask for.
 *
 *  2. `ContentLocale` is what a pin or a carousel is WRITTEN in, and that one
 *     IS plural on purpose: a single carousel feeds a French, a Spanish and a
 *     German account in their own words.
 *
 * Do not conflate the two. Narrowing the second would remove the reason this
 * tool exists.
 *
 * Plant care facts stay canonical in English in the catalog and are handed to
 * the model as reference data; the model writes in the target language. What
 * IS translated is the plant *name*, because French common names differ
 * substantially and are what people actually search on.
 */

export const CONTENT_LOCALES = ["fr", "en", "es", "de", "it"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/**
 * What a pin or carousel is written in when nothing else says.
 *
 * This is a CONTENT language, not an interface one - it decides what the model
 * writes, not what the operator reads.
 */
export const DEFAULT_CONTENT_LOCALE: ContentLocale = "fr";

/*
 * Named in French, not each in its own language.
 *
 * "English" and "Español" sitting in a French dropdown is the interface
 * speaking two languages at once. What is multilingual here is what gets
 * WRITTEN, not the label naming it.
 */
export const CONTENT_LOCALE_LABELS: Record<ContentLocale, string> = {
  fr: "Français",
  en: "Anglais",
  es: "Espagnol",
  de: "Allemand",
  it: "Italien",
};

export function isContentLocale(value: unknown): value is ContentLocale {
  return (
    typeof value === "string" &&
    (CONTENT_LOCALES as readonly string[]).includes(value)
  );
}

/** Full language name handed to the model, plus market context. */
export const LOCALE_WRITING: Record<
  ContentLocale,
  { language: string; market: string }
> = {
  en: {
    language: "English",
    market:
      "English-speaking users (UK, US, Canada, Australia). Use natural British-neutral English.",
  },
  fr: {
    language: "French",
    market:
      "French-speaking users (France, Belgium, Switzerland, Quebec). Use natural, idiomatic French - never a literal translation from English.",
  },
  es: {
    language: "Spanish",
    market:
      "Spanish-speaking users (Spain and Latin America). Use neutral Spanish that reads naturally on both sides of the Atlantic.",
  },
  de: {
    language: "German",
    market:
      "German-speaking users (Germany, Austria, Switzerland). Direct and precise, never stiff.",
  },
  it: {
    language: "Italian",
    market: "Italian-speaking users. Warm and conversational.",
  },
};

/* ------------------------------------------------------------ dictionary -- */

/**
 * The interface, in French.
 *
 * This object is the only dictionary there is, so it also defines what keys
 * exist: `TranslationKey` is derived from it below, and a key referenced in a
 * component but absent here is a compile error rather than a raw
 * "publish.modeDraft" rendered to the screen.
 */
const FR = {
  "nav.dashboard": "Tableau de bord",
  "nav.account": "Compte",
  "nav.groupPinterest": "Pinterest",
  "nav.groupTikTok": "TikTok",
  "nav.groupShared": "Partagé",
  "nav.generate": "Générer",
  "nav.library": "Pins",
  "nav.queue": "File d'attente",
  "nav.pinterest": "Pinterest",
  "nav.tiktok": "TikTok",
  "nav.accountPinterest": "Compte Pinterest",
  "nav.accountTikTok": "Compte TikTok",
  "nav.carousels": "Carrousels",

  "tiktok.addAccount": "Ajouter un compte",
  "tiktok.noAccounts": "Aucun compte connecté",
  "tiktok.noAccountsBody":
    "Connecte un compte TikTok, puis choisis sa langue de publication. Plusieurs comptes peuvent être connectés, chacun publiant dans sa langue.",
  "tiktok.noDirectPost": "pas de publication directe",
  "tiktok.language": "Langue de publication",

  "carousels.languages": "Langues à rédiger",
  "carousels.languagesHint":
    "Chaque compte publie dans la langue qui lui est assignée. Rédiger une langue que personne ne publie coûte une génération pour rien.",
  "carousels.posts": "Publié sur",
  "carousels.mentionHint": "Cette slide porte la mention Plenova",

  "publish.accounts": "Comptes",
  "publish.selected": "{n} sélectionné(s)",
  "publish.noEligible":
    "Aucun compte connecté ne publie dans une langue de ce carrousel.",
  "publish.skipped": "Non proposés, langue absente : {names}",
  "publish.multiResult": "{ok} publié(s), {ko} en échec.",
  "publish.someFailed": "Certains comptes ont échoué",
  "publish.confirmMulti": "Publier sur {n}",
  "tiktok.title": "TikTok",
  "tiktok.subtitle":
    "Connecte le compte TikTok de Plenova pour que le moteur publie des carrousels photo.",
  "tiktok.connection": "Connexion",
  "tiktok.connectBody":
    "Autorise le compte TikTok de Plenova. Les jetons sont chiffrés avant stockage et n'atteignent jamais le navigateur.",
  "tiktok.connect": "Connecter TikTok",
  "tiktok.disconnect": "Déconnecter",
  "tiktok.notConfigured": "Identifiants TikTok non renseignés",
  "tiktok.notConfiguredBody":
    "Ajoute TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET et TIKTOK_REDIRECT_URI, puis redéploie.",
  "tiktok.connectedTitle": "Compte connecté",
  "tiktok.connectedBody":
    "Le compte TikTok est lié et les carrousels peuvent être publiés.",
  "tiktok.failedTitle": "Échec de la connexion",
  "tiktok.directPost": "Publication directe",
  "tiktok.draft": "Envoi en brouillon",
  "tiktok.available": "Disponible",
  "tiktok.unavailable": "Non accordé",
  "tiktok.config": "Configuration de l'app",
  "tiktok.redirectUri": "URI de redirection",
  "tiktok.redirectHint":
    "Doit correspondre exactement à la valeur enregistrée sur l'app TikTok.",
  "tiktok.clientKey": "Client key",
  "tiktok.clientKeyMissing": "non renseigné",
  "tiktok.secret": "Secret",
  "tiktok.devMode": "Un sandbox est requis avant approbation",
  "tiktok.devModeBody":
    "TikTok refuse l'OAuth d'une app non approuvée, et le signale comme une erreur client_key alors que la clé est bonne. Dans le portail développeur, bascule le toggle à côté du nom de l'app sur Sandbox, crée-le en clonant la production, ajoute ton compte dans Target users, et utilise les clés du sandbox ici jusqu'à l'approbation.",
  "tiktok.scopes": "Scopes demandés",

  "carousels.title": "Carrousels",
  "carousels.subtitle":
    "Un nombre dans le thème fixe le nombre de slides : « Top 5 » en donne 5, plus une couverture.",
  "carousels.build": "Nouveau carrousel",
  "carousels.buildHint":
    "Décris le thème. Gemini écrit chaque slide — accroche, contenu, appel à l'action — puis peint une image pour chacune. Un thème contenant un nombre fixe le nombre de slides.",
  "carousels.theme": "Thème",
  "carousels.plantOptional": "Plante (optionnel)",
  "carousels.anyPlant": "Aucune plante précise",
  "carousels.generate": "Générer le carrousel",
  "carousels.generating": "Génération...",
  "carousels.starting": "Lancement...",
  "carousels.inFlight": "rédaction et illustration, {done}/{total} slides",
  "carousels.generatingHint":
    "Tourne sur le serveur — tu peux naviguer ailleurs ou fermer l'onglet, ça continue.",
  "carousels.caption": "Légende",
  "carousels.compose": "Incruster le texte",
  "carousels.recompose": "Refaire le texte",
  "carousels.imageSource": "Images",
  "carousels.sourcePhoto": "À partir de vraies photos (plus crédible)",
  "carousels.sourceGenerate": "Générées de zéro (plus rapide)",
  "carousels.sourceLibrary": "Réutiliser la bibliothèque (gratuit)",
  "carousels.sourceHint":
    "Les vraies photos servent seulement de référence : le modèle en peint une image originale, ce qui évite le rendu « généré ».",
  "carousels.noPexels":
    "PEXELS_API_KEY n'est pas renseignée, les slides seront donc générées de zéro.",
  "carousels.overlayStyle": "Style du texte",
  "carousels.styleStroke": "Blanc cerné de vert",
  "carousels.stylePill": "Pastilles blanches (TikTok)",
  "carousels.styleNone": "Blanc simple",
  "carousels.overlayHint":
    "Le texte est incrusté dans les slides par ton navigateur : ce que tu vois est ce qui sera publié.",
  "carousels.notComposed":
    "Les slides n'ont pas encore de texte. Incruste-le avant de publier, sinon le carrousel partira en photos nues.",
  "carousels.empty": "Aucun carrousel",
  "carousels.emptyBody":
    "Décris un thème ci-dessus et Gemini concevra puis illustrera tout le carrousel.",
  "carousels.publish": "Publier sur TikTok",
  "carousels.delete": "Supprimer",
  "carousels.slides": "{n} slides",

  "publish.title": "Publier sur TikTok",
  "publish.mode": "Mode de publication",
  "publish.modeDirect": "Publier maintenant",
  "publish.modeDirectHint": "Part en ligne sur le profil immédiatement.",
  "publish.modeDraft": "Envoyer en brouillon",
  "publish.modeDraftHint": "Arrive dans la boîte TikTok, à finir et publier à la main.",
  "publish.privacy": "Qui peut voir cette publication",
  "publish.privacyHint":
    "Les options viennent de ton compte TikTok et sont respectées telles quelles.",
  "publish.brandContent": "Contenu de marque — promotion d'une autre marque ou d'un tiers",
  "publish.brandOrganic": "Ta marque — promotion de toi-même ou de ta propre activité",
  "publish.confirm": "Publier",
  "publish.cancel": "Annuler",
  "publish.loading": "Chargement de ton compte TikTok...",
  "publish.published": "Publié. Identifiant TikTok : {id}",
  "publish.draftDone": "Envoyé dans tes brouillons TikTok.",
  "publish.needPrivacy": "Choisis d'abord qui peut voir la publication.",
  "nav.media": "Images",

  "pinterest.boardsFailed": "Impossible de charger les tableaux.",
  "pinterest.pinCount": "{n} pins",
  "pinterest.privacyPublic": "public",
  "pinterest.privacySecret": "secret",
  "pinterest.privacyProtected": "protégé",
  "carousels.more": "Autres actions",
  "carousels.composingCount": "Incrustation du texte, {done}/{total}",
  "status.generating": "en cours",
  "status.draft": "brouillon",
  "status.generated": "généré",
  "status.queued": "en file",
  "status.scheduled": "programmé",
  "status.publishing": "publication…",
  "status.published": "publié",
  "status.failed": "échec",
  "generate.advanced": "Options avancées",
  "carousels.options": "Options",
  "carousels.themePlaceholder": "Top 5 des pothos rares",
  "carousels.sourcePhotoShort": "Vraies photos",
  "carousels.sourceGenerateShort": "Images générées",
  "carousels.sourceLibraryShort": "Bibliothèque",
  "carousels.themeHint":
    "Un nombre dans le thème fixe le nombre de slides : « Top 5 » donne 5 slides plus une couverture.",
  "carousels.blockedNoKey": "Il manque la clé GEMINI_API_KEY.",
  "carousels.blockedTheme": "Écris un thème d'au moins 3 caractères.",
  "carousels.blockedLanguages": "Choisis au moins une langue.",
  "repost.blockedFiles": "Choisis d'abord tes captures d'écran.",
  "repost.reading": "Lecture des captures…",
  "repost.pickHint":
    "Une capture par slide, dans l'ordre. Le texte est relu et réécrit dans tes langues, et chaque photo est nettoyée de l'interface de l'app et de son texte d'origine.",
  "plant.unconfirmed": "espèce non confirmée",
  "media.title": "Bibliothèque d'images",
  "media.subtitle":
    "Toutes les images générées par le moteur, classées par plante et cultivar. Réutilise-en une plutôt que de repayer une génération.",
  "media.empty": "Aucune image",
  "media.emptyBody":
    "Génère un Pin et son image atterrit ici automatiquement, classée sous sa plante.",
  "media.allPlants": "Toutes les plantes",
  "media.search": "Rechercher une plante, un cultivar ou un prompt",
  "media.count": "{count} images sur {plants} plantes",
  "media.used": "utilisée {n}x",
  "media.reuse": "Réutiliser cette image",
  "media.delete": "Retirer de la bibliothèque",
  "media.noMatch": "Aucune image ne correspond à ces filtres.",

  "generate.variety": "Cultivar",
  "generate.varietyHint":
    "Optionnel, texte libre - ex. variegata, Thai Constellation. Classe l'image sous ce nom dans la bibliothèque.",
  "generate.reuse": "Réutiliser une image existante",
  "generate.reuseHint":
    "Saute la génération d'image et réutilise une image de la bibliothèque pour cette plante.",
  "generate.reuseNone": "Générer une nouvelle image",
  "generate.reuseAvailable": "{n} disponible(s) pour cette plante",

  "dashboard.title": "Tableau de bord",
  "dashboard.subtitle":
    "État de la génération et de la publication pour le canal Pinterest de Plenova.",
  "dashboard.plants": "Plantes",
  "dashboard.plantsHint": "au catalogue",
  "dashboard.angles": "Angles de contenu",
  "dashboard.anglesHint": "répartis en 5 catégories",
  "dashboard.possible": "Pins possibles",
  "dashboard.possibleHint": "par langue, 4 variations par slot",
  "dashboard.generated": "Générés",
  "dashboard.generatedHint": "stockés dans ce moteur",
  "dashboard.published": "Publiés",
  "dashboard.queued": "En file",
  "dashboard.scheduled": "Programmés",
  "dashboard.failed": "En échec",
  "dashboard.media": "Images en bibliothèque",
  "dashboard.mediaHint": "réutilisables entre canaux",
  "dashboard.reuses": "Réutilisations",
  "dashboard.reusesHint": "générations ayant sauté le modèle image",
  "dashboard.recent": "Pins récents",
  "dashboard.viewLibrary": "Voir la bibliothèque",
  "dashboard.empty": "Rien de généré pour l'instant.",
  "dashboard.emptyCta": "Générer le premier Pin",
  "dashboard.system": "Système",
  "dashboard.gemini": "Gemini",
  "dashboard.pinterestApp": "App Pinterest",
  "dashboard.connected": "Compte connecté",
  "dashboard.hosting": "Hébergement public des images",
  "dashboard.encryption": "Chiffrement des jetons",
  "dashboard.storage": "Stockage",
  "dashboard.ready": "Prêt",
  "dashboard.notSet": "Non configuré",
  "dashboard.notPersistentTitle": "Le stockage n'est pas persistant",
  "dashboard.notPersistent":
    "Les Pins ne vivent qu'en mémoire et disparaîtront au recyclage de la fonction serverless. Attache un store Vercel Blob avant de générer en volume.",

  "generate.title": "Générer",
  "generate.subtitle":
    "Choisis une plante et un angle. Gemini rédige le texte, puis peint un visuel 2:3 accordé à cet angle.",
  "generate.plant": "Plante",
  "generate.angle": "Angle de contenu",
  "generate.pinLanguage": "Langue du Pin",
  "generate.pinLanguageHint":
    "La langue de rédaction du Pin. Indépendante de la langue du tableau de bord.",
  "generate.style": "Style visuel",
  "generate.styleHint":
    "Laisse sur Auto pour que le moteur choisisse un format adapté à l'angle.",
  "generate.styleAuto": "Auto",
  "generate.custom": "Direction personnalisée",
  "generate.customHint": "Optionnel. Prioritaire sur l'intention par défaut de l'angle.",
  "generate.customPlaceholder":
    "ex. insister sur l'arrosage en hiver dans un appartement sans exposition sud",
  "generate.variation": "Variation",
  "generate.variationHint":
    "Chaque variation utilise une structure de titre et une composition différentes.",
  "generate.regenerate": "Régénérer par-dessus le Pin existant de ce slot",
  "generate.cta": "Générer le Pin",
  "generate.working": "Génération...",
  "generate.needKey":
    "Renseigne GEMINI_API_KEY dans l'environnement pour activer la génération.",
  "generate.failed": "Échec de la génération",
  "generate.duplicateHint":
    "Augmente le numéro de variation ou coche la case de régénération.",
  "generate.unreachable":
    "Serveur injoignable. Vérifie que le serveur de dev tourne.",

  "preview.empty": "Aucun Pin",
  "preview.emptyBody":
    "Choisis une plante et un angle, puis génère. L'aperçu s'affiche ici au ratio 2:3 de Pinterest.",
  "preview.working":
    "Rédaction du texte, puis création du visuel. Compte 20 à 60 secondes.",
  "preview.titleField": "Titre",
  "preview.descField": "Description",
  "preview.keywords": "Mots-clés",
  "preview.destination": "Destination",
  "preview.board": "Tableau Pinterest",
  "preview.selectBoard": "Choisir un tableau...",
  "preview.connectFirst": "Connecte Pinterest pour charger les tableaux",
  "preview.save": "Enregistrer",
  "preview.queue": "Ajouter à la file",
  "preview.publish": "Publier maintenant",
  "preview.saved": "Modifications enregistrées.",
  "preview.queued": "Ajouté à la file de publication.",
  "preview.notConnected":
    "Pinterest n'est pas connecté, la publication est donc désactivée. Tout le reste — génération, édition, mise en file — fonctionne normalement.",
  "preview.inline":
    "Stocké en inline — non publiable. Attache un store Blob, puis régénère.",
  "preview.lastError": "Dernière erreur",
  "preview.requestFailed": "La requête a échoué.",
  "preview.unreachable": "Serveur injoignable.",

  "library.title": "Bibliothèque",
  "library.subtitle":
    "Tous les Pins générés par ce moteur, avec leur statut de publication.",
  "library.allPlants": "Toutes les plantes",
  "library.allAngles": "Tous les angles",
  "library.allStatuses": "Tous les statuts",
  "library.allLanguages": "Toutes les langues",
  "library.allVarieties": "Tous les cultivars",
  "library.search": "Rechercher un titre, un texte ou un mot-clé",
  "library.count": "{shown} Pins sur {total}",
  "library.editing": "Édition",
  "library.close": "Fermer",
  "library.edit": "Éditer",
  "library.delete": "Supprimer",
  "library.empty": "Aucun Pin",
  "library.emptyBody":
    "Les Pins générés sont stockés ici avec leur statut, pour être relus, édités et publiés plus tard.",
  "library.emptyCta": "Générer un Pin",
  "library.noMatch": "Aucun résultat",
  "library.noMatchBody":
    "Aucun Pin ne correspond aux filtres. Essaie d'effacer la recherche ou le statut.",

  "queue.title": "File d'attente",
  "queue.subtitle":
    "Pins en attente de publication. Le worker cron Vercel vide la file toutes les heures, par petits lots.",
  "queue.empty": "File vide",
  "queue.emptyBody":
    "Génère un Pin, choisis un tableau, puis ajoute-le à la file pour programmer sa publication.",
  "queue.noCronTitle": "Le worker cron n'est pas armé",
  "queue.noCron":
    "Renseigne CRON_SECRET dans le projet Vercel pour que le publieur programmé s'authentifie. En attendant, publie manuellement depuis la bibliothèque.",
  "queue.noBoard": "Aucun tableau sélectionné",
  "queue.board": "Tableau",
  "queue.attempts": "tentative(s)",

  "pinterest.title": "Pinterest",
  "pinterest.subtitle":
    "Connecte le compte Pinterest de Plenova pour que le moteur lise les tableaux et publie les Pins.",
  "pinterest.connection": "Connexion",
  "pinterest.connectBody":
    "Autorise le compte Pinterest de Plenova. Les jetons sont chiffrés avant stockage et n'atteignent jamais le navigateur.",
  "pinterest.connect": "Connecter Pinterest",
  "pinterest.disconnect": "Déconnecter",
  "pinterest.connectedAt": "Connecté le",
  "pinterest.expires": "le jeton expire le",
  "pinterest.boards": "Tableaux",
  "pinterest.loadingBoards": "Chargement des tableaux...",
  "pinterest.noBoards": "Aucun tableau trouvé",
  "pinterest.noBoardsBody": "Crée un tableau sur Pinterest, puis recharge la page.",
  "pinterest.config": "Configuration de l'app",
  "pinterest.redirectUri": "URI de redirection",
  "pinterest.redirectHint":
    "Doit correspondre exactement à la valeur enregistrée sur l'app Pinterest.",
  "pinterest.scopes": "Scopes demandés",
  "pinterest.apiBase": "Base API",
  "pinterest.destination": "Destination des Pins",
  "pinterest.notConfigured": "Identifiants Pinterest non renseignés",
  "pinterest.noHostingTitle": "Pas d'hébergement public des images",
  "pinterest.noHosting":
    "Pinterest récupère les images par URL. Attache un store Vercel Blob pour que les images générées aient une URL publique ; sans ça les Pins se génèrent et se relisent mais ne se publient pas.",
  "pinterest.connectedTitle": "Compte connecté",
  "pinterest.connectedBody":
    "Le compte Pinterest est lié et les tableaux sont disponibles dans le générateur.",
  "pinterest.failedTitle": "Échec de la connexion",
  "pinterest.trialTitle": "Jeton d'essai en lecture seule",
  "pinterest.trialBody":
    "Le moteur est authentifié avec un jeton d'essai fourni manuellement. Les tableaux sont lisibles, mais la publication exige le scope pins:write, que l'accès d'essai n'accorde pas.",

  "login.intro":
    "Studio de contenu interne pour Plenova, application d'entretien des plantes d'intérieur. Il génère images et textes, et les publie sur nos propres comptes Pinterest et TikTok. Accès réservé aux personnes autorisées.",
  "login.terms": "Conditions d'utilisation",
  "login.privacy": "Politique de confidentialité",
  "login.password": "Mot de passe",
  "login.cta": "Se connecter",
  "login.failed": "Mot de passe incorrect.",

  "common.language": "Langue",
  "common.uiLanguage": "Langue du tableau de bord",
  "editor.title": "Édition de la slide {n}",
  "editor.displayLanguage": "Langue affichée",
  "editor.blockTitle": "Titre",
  "editor.blockSubtitle": "Sous-titre",
  "carousels.slidesMissed": "Les slides {slides} n'ont pas pu être rendues en {lang} : {reason}",
  "repost.title": "Reposter un carrousel existant",
  "repost.body": "Prends des captures d'écran d'un carrousel qui te plaît, une par slide. Le texte est relu et réécrit dans tes langues, et chaque photo est nettoyée de l'interface de l'app et de son texte d'origine. Tu obtiens un carrousel normal, que tu peux ensuite éditer et publier.",
  "repost.pick": "Choisir des captures",
  "repost.none": "Aucune capture choisie.",
  "repost.chosen": "{n} capture(s) choisie(s).",
  "repost.order": "Elles sont utilisées dans l'ordre où tu les as sélectionnées.",
  "repost.sending": "Envoi {done} sur {total}",
  "repost.start": "Refaire à notre sauce · {n}",
  "carousels.composeBusy": "Attends la fin de la gravure déjà en cours.",
  "carousels.confirmDelete": "Clique encore pour supprimer",
  "carousels.openLabel": "Ouvrir ce carrousel",
  "carousels.needsText": "Ajoute le texte sur les slides avant de publier.",
  "common.dismiss": "Fermer",
  "carousels.postFailed": "rejeté par TikTok",
  "carousels.checkStatus": "Redemander à TikTok",
  "carousels.checkStatusHint": "TikTok télécharge les slides après avoir accepté, ce qui prend plusieurs minutes. Ceci lui redemande où en est le post.",
  "carousels.postDraft": "en brouillon",
  "carousels.postPublished": "publié",
  "carousels.postPending": "en attente de TikTok",
  "publish.draftResult": "{ok} envoyé(s) en brouillon, {ko} en échec.",
  "publish.draftWhere": "Ouvre TikTok sur le téléphone : le carrousel attend dans la boîte de réception, prêt à être relu et posté à la main. Il n'est pas encore sur le profil.",
  "publish.publishedWhere": "Il est sur le profil du compte. Un post en « Moi uniquement » n'est visible que par toi, donc regarde en étant connecté à ce compte.",
  "publish.postTitle": "Titre",
  "publish.postTitleHint": "Laisse tel quel et chaque langue garde le titre écrit pour elle. Écris ici et ce titre est utilisé pour tous les comptes sélectionnés.",
  "publish.disclosure": "Ce contenu fait la promotion d'une marque, d'un produit ou d'un service",
  "publish.disclosureNeeded": "Tu dois indiquer si ton contenu fait ta propre promotion, celle d'un tiers, ou les deux.",
  "publish.labelPromotional": "Ta photo portera la mention « Contenu promotionnel ».",
  "publish.labelPaid": "Ta photo portera la mention « Partenariat rémunéré ».",
  "publish.brandedNotPrivate": "La visibilité d'un contenu de marque ne peut pas être privée.",
  "publish.consentBranded": "En publiant, tu acceptes la politique de contenu de marque et la confirmation d'usage musical de TikTok.",
  "publish.aigc": "Ces slides ont été générées par un modèle d'image",
  "publish.aigcHint": "Déclaré à TikTok, ce qui correspond à la réalité des slides.",
  "publish.perAccount": "Les options propres à chaque compte sont utilisées, et seuls les choix que tous les comptes sélectionnés autorisent sont proposés.",
  "publish.creatorUnavailable": "TikTok n'a pas renvoyé les informations de ce compte, dont la publication directe a besoin. L'envoi en brouillon, lui, n'en a pas besoin.",
  "publish.retry": "Réessayer",
  "publish.allowComment": "Autoriser les commentaires",
  "publish.commentDisabled": "Ce compte a désactivé les commentaires dans ses propres réglages.",
  "publish.consent": "En publiant, tu acceptes la confirmation d'usage musical de TikTok.",
  "publish.unaudited": "Tant que l'app n'a pas passé l'audit TikTok, une publication directe n'est acceptée qu'en « Moi uniquement », depuis un compte lui-même privé. Le brouillon n'a pas cette contrainte.",
  "publish.postNow": "Publier maintenant · {n}",
  "publish.sendDraft": "Envoyer en brouillon · {n}",
  "publish.actionHint": "Un brouillon arrive dans la boîte de réception du compte sur le téléphone, prêt à être relu et posté à la main. Publier envoie tout de suite.",
  "editor.imageBroken": "La photo de cette slide n'a pas pu être chargée, l'aperçu ne montre donc que le texte. Régénère le carrousel si ça persiste.",
  "editor.blockCta": "Mention Plenova",
  "editor.ctaHint": "Affichée seulement si elle contient du texte. Une slide la porte en général.",
  "editor.slideStyle": "Style de la slide",
  "editor.blockStyle": "Style",
  "editor.styleInherit": "Comme la slide",
  "editor.styleStroke": "Contour Plenova",
  "editor.stylePillWhite": "Pastille blanche",
  "editor.stylePillBlack": "Pastille noire",
  "editor.styleNone": "Texte brut",
  "editor.align": "Alignement",
  "editor.size": "Taille",
  "editor.weight": "Graisse",
  "editor.lineHeight": "Interligne",
  "editor.strokeColor": "Couleur du contour",
  "editor.strokeWidth": "Épaisseur du contour",
  "editor.hint": "Le texte s'écrit par langue. Position, taille et style sont partagés entre toutes.",
  "editor.drag": "Glisse un bloc pour le déplacer, ses coins pour le redimensionner.",
  "editor.undo": "Annuler",
  "editor.redo": "Rétablir",
  "editor.keys": "Les flèches déplacent le bloc sélectionné, Maj les fait avancer de dix, et Ctrl+Z annule.",
  "editor.reset": "Réinitialiser la disposition",
  "editor.save": "Enregistrer",
  "editor.cancel": "Annuler",
  "editor.saving": "Enregistrement...",
  "editor.empty": "Cette slide n'a pas encore de texte en {lang}. Écris-le ici.",
  "editor.open": "Modifier",
};

export type TranslationKey = keyof typeof FR;

export type Translator = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * One translator, kept.
 *
 * Its stable identity is not an optimisation. A fresh function on every call
 * makes any React effect that depends on it re-run on every render, and an
 * effect that also sets state then re-renders and re-runs itself without end.
 * That is what turned opening the publish screen into an unbounded stream of
 * creator-info calls to TikTok, and into a rate limit that never cleared.
 */
const TRANSLATE: Translator = (key, vars) => {
  let out = FR[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
};

/** The interface dictionary. Takes no locale: there is one. */
export function translator(): Translator {
  return TRANSLATE;
}

/** Shorthand for the common case of translating a single string. */
export const t = TRANSLATE;
