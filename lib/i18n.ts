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
  "nav.groupPinterest": "Pinterest",
  "nav.groupTikTok": "TikTok",
  "nav.groupShared": "Partagé",
  "nav.generate": "Générer",
  "nav.library": "Pins",
  "nav.queue": "File d'attente",
  "nav.accountPinterest": "Compte Pinterest",
  "nav.accountTikTok": "Compte TikTok",
  "nav.carousels": "Carrousels",
  "nav.signOut": "Se déconnecter",
  "nav.signingOut": "Déconnexion…",

  "tiktok.addAccount": "Ajouter un compte",
  "tiktok.noAccounts": "Aucun compte connecté",
  "tiktok.noAccountsBody":
    "Connecte un compte TikTok, puis choisis sa langue de publication. Plusieurs comptes peuvent être connectés, chacun publiant dans sa langue.",
  "tiktok.noDirectPost": "pas de publication directe",
  "tiktok.language": "Langue de publication",

  "carousels.languages": "Langues à rédiger",
  "carousels.posts": "Publié sur",
  "carousels.mentionHint": "Cette slide porte la mention Plenova",

  "publish.accounts": "Comptes",
  "publish.selected": "{n} sélectionné(s)",
  "publish.noEligible":
    "Aucun compte connecté ne publie dans une langue de ce carrousel.",
  "publish.skipped": "Non proposés, langue absente : {names}",
  "publish.multiResult": "{ok} publié(s), {ko} en échec.",
  "publish.someFailed": "Certains comptes ont échoué",
  "tiktok.title": "Compte TikTok",
  "tiktok.noHostingTitle": "Pas d'hébergement public des images",
  "tiktok.noHosting":
    "TikTok télécharge les slides depuis une adresse publique. Tant qu'aucun stockage Blob n'est attaché, les carrousels se génèrent et s'éditent, mais ne peuvent pas être publiés.",
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
    "Écris un thème : Gemini rédige chaque slide dans tes langues et l'illustre. Tout se retouche ensuite dans l'éditeur.",
  "carousels.retry": "Relancer",
  "carousels.connectAccount": "Connecter un compte TikTok",
  "carousels.publishNeedsAccount": "Connecte d'abord un compte TikTok.",
  "carousels.publishNeedsCompose": "Mets d'abord les images à jour avec « Incruster le texte ».",
  "carousels.publishComposing": "Les images se mettent à jour, un instant.",
  "carousels.build": "Nouveau carrousel",
  "carousels.theme": "Thème",
  "carousels.plantOptional": "Plante (optionnel)",
  "carousels.anyPlant": "Aucune plante précise",
  "carousels.generate": "Générer le carrousel",
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
  "carousels.noPexels":
    "PEXELS_API_KEY n'est pas renseignée, les slides seront donc générées de zéro.",
  "carousels.overlayStyle": "Style du texte",
  "carousels.notComposed":
    "Images pas encore à jour pour {slides}. « Incruster le texte » les refait avant de publier.",
  "carousels.empty": "Aucun carrousel",
  "carousels.emptyBody":
    "Décris un thème ci-dessus et Gemini concevra puis illustrera tout le carrousel.",
  "carousels.publish": "Publier sur TikTok",
  "carousels.delete": "Supprimer",
  "carousels.slides": "{n} slides",

  "publish.title": "Publier sur TikTok",
  "publish.privacy": "Qui peut voir cette publication",
  "publish.privacyHint":
    "Les options viennent de ton compte TikTok et sont respectées telles quelles.",
  "publish.brandContent": "Contenu de marque — promotion d'une autre marque ou d'un tiers",
  "publish.brandOrganic": "Ta marque — promotion de toi-même ou de ta propre activité",
  "publish.cancel": "Annuler",
  "publish.loading": "Chargement de ton compte TikTok...",
  "publish.needPrivacy": "Choisis d'abord qui peut voir la publication.",
  "nav.media": "Images",

  "pinterest.boardsFailed": "Impossible de charger les tableaux.",
  "pinterest.pinCount": "{n} pins",
  "pinterest.privacyPublic": "public",
  "pinterest.privacySecret": "secret",
  "pinterest.privacyProtected": "protégé",
  "carousels.more": "Autres actions",
  "carousels.slideLabel": "Slide {i} sur {n}",
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
  "carousels.languageCount": "{n} langues",
  "carousels.themePlaceholder": "Top 5 des pothos rares",
  "carousels.themeHint":
    "Un nombre dans le thème fixe le nombre de slides : « Top 5 » donne 5 slides plus une couverture.",
  "carousels.blockedNoKey": "Il manque la clé GEMINI_API_KEY.",
  "carousels.blockedTheme": "Écris un thème d'au moins 3 caractères.",
  "carousels.blockedLanguages": "Choisis au moins une langue.",
  "repost.blockedFiles": "Choisis d'abord tes captures d'écran.",
  "repost.reading": "Lecture des captures…",
  "repost.dropHere": "Dépose tes captures ici",
  "repost.dropTitle": "Glisse tes captures ici, ou clique pour les choisir",
  "repost.dropBody": "Une capture par slide. Elles sont rangées par date de capture.",
  "repost.shotLabel": "Capture {i} sur {n}",
  "repost.remove": "Retirer cette capture",
  "repost.orderByDate":
    "{n} captures, de la plus ancienne à la plus récente. Glisse-les pour changer l'ordre.",
  "repost.orderManual": "{n} captures, dans l'ordre que tu as choisi.",
  "repost.clear": "Tout retirer",
  "repost.add": "Ajouter",
  "repost.pickHint":
    "Le texte est relu et réécrit dans tes langues, et chaque photo est nettoyée de l'interface de l'app et de son texte d'origine.",
  "plant.unconfirmed": "espèce non confirmée",
  "media.title": "Bibliothèque d'images",
  "media.shelfCta": "CTA Plenova",
  "media.shelfCtaHint":
    "Tes images préparées pour la slide qui mentionne Plenova. Chaque nouveau carrousel en prend une, la moins utilisée d'abord.",
  "media.shelfHook": "Hook / Outro",
  "media.shelfHookHint":
    "Couverture et clôture des carrousels construits depuis la bibliothèque. Les images dont l'espèce n'est pas identifiée arrivent ici d'elles-mêmes.",
  "media.shelfSpecies": "Par espèce",
  "media.shelfEmptyDrop": "Glisse tes images ici, ou clique pour les choisir.",
  "media.dropHere": "Dépose tes images ici",
  "media.upload": "Ajouter des images",
  "media.uploading": "Envoi {done} sur {total}…",
  "media.subtitle":
    "Tout ce qui se réutilise : slides prêtes, images CTA et Hook, puis les photos de chaque espèce. Réutiliser une image évite de repayer une génération.",
  "media.empty": "Aucune image",
  "media.emptyBody":
    "Génère un Pin et son image atterrit ici automatiquement, classée sous sa plante.",
  "media.allPlants": "Toutes les plantes",
  "media.search": "Rechercher une plante, un cultivar ou un prompt",
  "media.count": "{count} images sur {plants} plantes",
  "media.used": "utilisée {n}x",
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
  "dashboard.subtitle": "Où en sont TikTok et Pinterest, et par où continuer.",
  "dashboard.newCarousel": "Nouveau carrousel TikTok",
  "dashboard.newPins": "Générer des Pins",
  "dashboard.openLibrary": "Bibliothèque d'images",
  "dashboard.allCarousels": "Tous les carrousels",
  "dashboard.allPins": "Tous les Pins",
  "dashboard.cDraft": "Brouillons",
  "dashboard.cPublished": "Publiés",
  "dashboard.cInFlight": "En cours",
  "dashboard.cFailed": "En échec",
  "dashboard.noAccounts": "Aucun compte TikTok connecté.",
  "dashboard.connectAccount": "Connecter un compte",
  "dashboard.accounts": "Comptes connectés : {list}",
  "dashboard.noCarousels": "Aucun carrousel pour l'instant.",
  "dashboard.firstCarousel": "Créer le premier",
  "dashboard.pinterestConnected": "Compte Pinterest connecté.",
  "dashboard.pinterestNotConnected": "Aucun compte Pinterest connecté.",
  "dashboard.generated": "Générés",
  "dashboard.published": "Publiés",
  "dashboard.queued": "En file",
  "dashboard.failed": "En échec",
  "dashboard.library": "Bibliothèque",
  "dashboard.media": "Images",
  "dashboard.templates": "Slides prêtes",
  "dashboard.reuses": "Réutilisations",
  "dashboard.plants": "Plantes au catalogue",
  "dashboard.libraryHint":
    "Les images déjà payées se réutilisent d'un carrousel ou d'un Pin à l'autre ; les slides prêtes (ta CTA, typiquement) s'ajoutent à n'importe quel carrousel depuis l'éditeur.",
  "dashboard.empty": "Aucun Pin pour l'instant.",
  "dashboard.emptyCta": "Générer le premier",
  "dashboard.system": "Système",
  "dashboard.gemini": "Gemini",
  "dashboard.tiktokAccounts": "Comptes TikTok",
  "dashboard.pinterestApp": "App Pinterest",
  "dashboard.hosting": "Hébergement public des images",
  "dashboard.encryption": "Chiffrement des jetons",
  "dashboard.storage": "Stockage",
  "dashboard.ready": "Prêt",
  "dashboard.notSet": "Non configuré",
  "dashboard.notPersistentTitle": "Le stockage n'est pas persistant",
  "dashboard.notPersistent":
    "Les données ne vivent qu'en mémoire et disparaîtront au recyclage de la fonction serverless. Branche Supabase (ou un store Vercel Blob) avant de générer en volume.",

  "generate.title": "Générer des Pins",
  "generate.subtitle":
    "Choisis une plante et un angle. Gemini rédige le texte, puis peint un visuel 2:3 accordé à cet angle.",
  "generate.plant": "Plante",
  "generate.angle": "Angle de contenu",
  "generate.pinLanguage": "Langue du Pin",
  "generate.pinLanguageHint":
    "La langue dans laquelle le Pin est rédigé.",
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

  "library.title": "Pins",
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
    "Les Pins programmés partent tout seuls, toutes les heures, par petits lots.",
  "queue.openPins": "Voir les Pins",
  "queue.empty": "File vide",
  "queue.emptyBody":
    "Génère un Pin, choisis un tableau, puis ajoute-le à la file pour programmer sa publication.",
  "queue.noCronTitle": "Le worker cron n'est pas armé",
  "queue.noCron":
    "Renseigne CRON_SECRET dans le projet Vercel pour que le publieur programmé s'authentifie. En attendant, publie manuellement depuis la bibliothèque.",
  "queue.noBoard": "Aucun tableau sélectionné",
  "queue.board": "Tableau",
  "queue.attempts": "tentative(s)",

  "pinterest.title": "Compte Pinterest",
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
  "login.email": "Adresse e-mail",
  "login.emailHint":
    "Seules les adresses autorisées reçoivent un code.",
  "login.sendCode": "Recevoir le lien de connexion",
  "login.code": "Ou saisis le code de l'e-mail",
  "login.checkMail": "Vérifie ta boîte mail",
  "login.checkMailBody": "Un e-mail vient de partir vers {email}. Ouvre le lien qu'il contient sur cet appareil : tu seras connecté directement.",
  "login.resend": "Renvoyer l'e-mail",
  "login.resendIn": "Renvoyer dans {s} s",
  "login.codeHint": "Seulement si l'e-mail contient un code chiffré.",
  "login.verify": "Se connecter",
  "login.changeEmail": "Utiliser une autre adresse",
  "login.checkingLink": "Connexion en cours…",
  "login.badCode": "Code incorrect ou expiré.",
  "login.failed": "La connexion a échoué.",
  "login.unreachable": "Le serveur est injoignable.",

  "editor.displayLanguage": "Langue affichée",
  "editor.blockTitle": "Titre",
  "editor.blockSubtitle": "Sous-titre",
  "carousels.slidesMissed": "Impossible de rendre {slides} ({lang}) : {reason}",
  "repost.title": "Reposter un carrousel existant",
  "repost.pick": "Choisir des captures",
  "repost.sending": "Envoi {done} sur {total}",
  "repost.start": "Refaire à notre sauce · {n}",
  "repost.startEmpty": "Refaire à notre sauce",
  "carousels.composeBusy": "Attends la fin de la gravure déjà en cours.",
  "carousels.confirmDelete": "Clique encore pour supprimer",
  "carousels.openLabel": "Ouvrir ce carrousel",
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
  "editor.imageBroken": "La photo de cette slide n'a pas pu être chargée, l'aperçu ne montre donc que le texte. Change-la ou régénère-la depuis le panneau Slide.",
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
  "editor.undo": "Annuler",
  "editor.redo": "Rétablir",
  "editor.reset": "Réinitialiser la disposition de cette slide",
  "editor.saving": "Enregistrement…",
  "editor.untranslated": "Écrit en {langs}, pas encore en {lang}.",
  "editor.workspace": "Éditeur de slides",
  "editor.close": "Fermer",
  "editor.slideOf": "Slide {n} / {total}",
  "editor.prev": "Slide précédente",
  "editor.next": "Slide suivante",
  "editor.zones": "Zones TikTok",
  "editor.zonesHint": "Hachuré : ce que l'interface TikTok recouvre sur la plupart des téléphones (approximatif).",
  "editor.grid": "Grille",
  "editor.export": "Exporter",
  "editor.exportOne": "Cette slide ({n})",
  "editor.exportAll": "Toutes les slides ({n})",
  "editor.exportDetail": "JPEG 1080 × 1350, texte en {lang}, tel que publié",
  "editor.exporting": "Export {done}/{total}…",
  "editor.exported": "Export terminé : {n} image(s).",
  "editor.exportFailed": "Impossible d'exporter la ou les slides {slides}.",
  "editor.shortcuts": "Raccourcis clavier",
  "editor.saveCount": "Enregistrer ({n})",
  "editor.saved": "Enregistré",
  "editor.savedFlash": "Modifications enregistrées.",
  "editor.saveFailed": "L'enregistrement n'a pas abouti : {reason}",
  "editor.unsavedTitle": "Modifications non enregistrées",
  "editor.unsavedBody": "Slides modifiées sans être enregistrées : {n}. Tu peux les enregistrer avant de fermer, ou les abandonner.",
  "editor.keepEditing": "Continuer",
  "editor.discard": "Quitter sans enregistrer",
  "editor.saveAndClose": "Enregistrer et fermer",
  "editor.textSection": "Texte · {lang}",
  "editor.ctaHintHere": "C'est la slide qui porte la mention Plenova de ce carrousel.",
  "editor.blockSection": "Bloc",
  "editor.noBlock": "Clique un bloc sur la slide, ou choisis-le ci-dessus.",
  "editor.colorText": "Couleur du texte",
  "editor.colorPill": "Couleur de la pastille",
  "editor.colorTextHint": "Le contour garde sa propre couleur.",
  "editor.colorPillHint": "Le texte passe en noir ou en blanc selon ce qui se lit le mieux, comme sur TikTok.",
  "editor.colorAuto": "Couleur du style",
  "editor.colorCustom": "Autre couleur",
  "editor.weight400": "Normal",
  "editor.weight500": "Medium",
  "editor.weight600": "Semi-gras",
  "editor.weight700": "Gras",
  "editor.weight800": "Extra-gras",
  "editor.weight900": "Noir",
  "editor.alignLeft": "Aligner à gauche",
  "editor.alignCenter": "Centrer le texte",
  "editor.alignRight": "Aligner à droite",
  "editor.geometry": "Position et taille (px)",
  "editor.posX": "Position horizontale du centre",
  "editor.posY": "Position verticale du centre",
  "editor.width": "Largeur",
  "editor.height": "Hauteur",
  "editor.centerH": "Centrer horizontalement",
  "editor.centerV": "Centrer verticalement",
  "editor.resetBlock": "Réinitialiser",
  "editor.slideSection": "Slide",
  "editor.photo": "Photo",
  "editor.photoChange": "Changer la photo",
  "editor.photoPending": "Nouvelle photo : elle remplacera l'ancienne à l'enregistrement.",
  "editor.crop": "Recadrer",
  "editor.cropDone": "Terminer le recadrage",
  "editor.cropHint": "Glisse la photo pour la déplacer, molette pour zoomer.",
  "editor.cropReset": "Recentrer",
  "editor.zoom": "Zoom",
  "editor.regen": "Régénérer avec l'IA",
  "editor.regenPrompt": "Consigne pour la photo",
  "editor.regenSource": "Méthode",
  "editor.regenPhoto": "Vraie photo retravaillée",
  "editor.regenPhotoDetail": "Pexels puis Gemini",
  "editor.regenGenerate": "Création Gemini",
  "editor.regenGo": "Générer une nouvelle photo",
  "editor.regenBusy": "Génération en cours…",
  "editor.regenHint": "Compte 20 à 60 secondes. La photo rejoint aussi la bibliothèque.",
  "editor.regenElsewhere": "Une autre slide est déjà en cours de génération.",
  "editor.regenDone": "Nouvelle photo posée sur la slide {n}. Enregistre pour la garder.",
  "editor.allSection": "Mise en page",
  "editor.applyLayout": "Appliquer cette mise en page partout",
  "editor.applyStyle": "Appliquer seulement le style partout",
  "editor.applyHint": "La mise en page copie la position, la taille et le style des blocs sur les autres slides ; le style seul garde leurs positions. Textes et photos ne bougent pas, et Ctrl+Z annule.",
  "editor.appliedLayout": "Mise en page copiée sur les {n} autres slides.",
  "editor.appliedStyle": "Style copié sur les {n} autres slides.",
  "editor.issueRail": "{block} : sous les boutons TikTok",
  "editor.issueCaption": "{block} : sous la légende TikTok",
  "editor.issueOutside": "{block} : dépasse du cadre",
  "editor.showZones": "Voir les zones",
  "editor.canvasHint": "Double-clic pour écrire · coins pour agrandir · côtés pour la largeur · Suppr pour retirer · Alt pour ignorer le magnétisme.",
  "editor.langMissing": "Slides à traduire en {lang} : {n}",
  "editor.pickerTitle": "Choisir une photo",
  "editor.pickerPlant": "Cette plante",
  "editor.pickerAll": "Toute la bibliothèque",
  "editor.pickerSearch": "Rechercher…",
  "editor.pickerUpload": "Importer",
  "editor.pickerDrop": "Dépose ici, rangé dans « {shelf} »",
  "editor.pickerEmpty": "Rien dans cette étagère pour l'instant.",
  "editor.pickerEmptyBody": "Glisse une image ici, ou clique pour en importer une.",
  "editor.pickerCurrent": "Actuelle",
  "editor.pickerRatio": "Pas au format 4:5 : pense à la recadrer.",
  "editor.pickerUploadTo": "Une image importée ici est rangée dans « {shelf} » ; si tu n'en importes qu'une, elle est posée sur la slide.",
  "editor.slidesNav": "Slides du carrousel",
  "editor.thumbMention": "Porte la mention Plenova",
  "editor.thumbMissing": "Texte écrit dans une autre langue, pas encore dans celle-ci",
  "editor.thumbDirty": "modifiée",
  "editor.thumbDirtyHint": "Modifiée, pas encore enregistrée",
  "editor.keyMove": "Déplacer un bloc (Alt : sans magnétisme)",
  "editor.keyCorner": "Agrandir un bloc et son texte",
  "editor.keySide": "Changer la largeur, le texte se recoupe",
  "editor.keyWrite": "Écrire directement dans le bloc",
  "editor.keyNudge": "Déplacer de 1 px (Maj : 10 px)",
  "editor.keySlides": "Slide précédente / suivante",
  "editor.keyUndo": "Annuler / rétablir",
  "editor.keySave": "Enregistrer",
  "editor.keyCrop": "Recadrer la photo",
  "editor.keyGuides": "Zones TikTok / grille",
  "editor.keyEscape": "Sortir du mode en cours, puis fermer",
  "editor.addSlide": "Ajouter une slide après celle-ci",
  "editor.addSlideShort": "Ajouter",
  "editor.addSlideTitle": "Ajouter une slide",
  "editor.addSlideFull": "TikTok accepte 35 slides au plus par carrousel.",
  "editor.slideAdded": "Slide ajoutée. Enregistre pour la garder.",
  "editor.slideDuplicated": "Slide dupliquée.",
  "editor.slideRemoved": "Slide retirée. Ctrl+Z pour la remettre.",
  "editor.blockDeleted": "Bloc « {block} » retiré de la slide, dans toutes les langues. Ctrl+Z pour annuler.",
  "editor.deleteBlock": "Retirer",
  "editor.deleteBlockHint": "Retire ce texte de la slide, dans toutes les langues (Suppr)",
  "editor.keyDelete": "Retirer le bloc sélectionné (ou la slide, si sa vignette est choisie au clavier)",
  "editor.templateMissing": "Slide ajoutée, mais elle n'a pas de texte en {langs} : écris-le ou complète la slide prête.",
  "editor.templateDefault": "Slide",
  "editor.templateDefaultCta": "CTA Plenova",
  "editor.duplicate": "Dupliquer",
  "editor.removeSlide": "Retirer",
  "editor.saveTemplate": "Garder comme slide prête",
  "editor.saveTemplateHint": "Photo, mise en page et textes, réutilisables dans n'importe quel carrousel.",
  "editor.saveTemplateNoPhoto": "Cette slide n'a pas de photo de la bibliothèque.",
  "editor.pickerTemplates": "Slides prêtes",
  "editor.pickerTemplatesHint": "Une slide prête arrive avec sa photo, sa mise en page et ses textes dans les langues du carrousel.",
  "templates.insert": "Ajouter cette slide au carrousel",
  "templates.edit": "Modifier",
  "templates.delete": "Supprimer",
  "templates.confirmDelete": "Confirmer",
  "templates.languages": "Langues écrites",
  "templates.missingLang": "Pas encore écrite en {lang}",
  "templates.none": "Aucune slide prête pour l'instant",
  "templates.noneBody": "Dans l'éditeur, « Garder comme slide prête » enregistre la slide ouverte - ta CTA Plenova par exemple - avec ses textes dans chaque langue.",
  "templates.createTitle": "Garder comme slide prête",
  "templates.editTitle": "Modifier la slide prête",
  "templates.name": "Nom",
  "templates.nameRequired": "Donne un nom à cette slide.",
  "templates.kind": "Type",
  "templates.kindCta": "CTA Plenova",
  "templates.kindContent": "Contenu",
  "templates.wordsPerLanguage": "Textes par langue",
  "templates.written": "écrite",
  "templates.previewIn": "Aperçu en {lang}",
  "templates.translate": "Traduire depuis le {from} ({n} langue(s) vide(s))",
  "templates.allWritten": "Toutes les langues sont écrites",
  "templates.translateHint": "Remplit seulement les langues vides, sans toucher à celles déjà écrites.",
  "templates.translated": "Proposé en {langs}. Relis avant d'enregistrer.",
  "templates.cancel": "Annuler",
  "templates.save": "Enregistrer",
  "templates.saved": "« {name} » est prête pour tes prochains carrousels.",
  "templates.updated": "« {name} » mise à jour.",
  "templates.shelfTitle": "Slides prêtes",
  "templates.shelfHint": "Des slides complètes - photo, mise en page, textes dans chaque langue - à ajouter dans n'importe quel carrousel depuis l'éditeur. Ta CTA Plenova, typiquement.",
  "editor.open": "Modifier",

  "nav.hooks": "Hooks",
  "nav.spy": "Spy",

  "hooks.title": "Hooks",
  "hooks.subtitle": "Les phrases de couverture de tes carrousels. Tout ce qui est ici, utilisé ou gardé, ne te sera plus jamais proposé par Gemini.",
  "hooks.add": "Ajouter",
  "hooks.addPlaceholder": "Écris un hook, par exemple « 5 plantes qui survivent à tout »",
  "hooks.search": "Rechercher un hook",
  "hooks.filterAll": "Tous",
  "hooks.filterIdea": "À utiliser",
  "hooks.filterUsed": "Déjà utilisés",
  "hooks.sourceManual": "Ajouté à la main",
  "hooks.sourceGemini": "Gemini",
  "hooks.sourceCarousel": "Carrousel",
  "hooks.sourceSpy": "Spy",
  "hooks.statusIdea": "À utiliser",
  "hooks.statusUsed": "Utilisé",
  "hooks.use": "Utiliser",
  "hooks.useHint": "Ouvre un nouveau carrousel avec ce hook",
  "hooks.edit": "Modifier le texte",
  "hooks.markUsed": "Marquer comme utilisé",
  "hooks.markIdea": "Remettre à utiliser",
  "hooks.delete": "Supprimer",
  "hooks.confirmDelete": "Confirmer la suppression",
  "hooks.empty": "Aucun hook pour l'instant",
  "hooks.emptyBody": "Ajoute tes idées, ou demande à Gemini d'en proposer : il évitera tout ce qui est déjà dans cette liste.",
  "hooks.noMatch": "Aucun hook ne correspond.",
  "hooks.duplicate": "Déjà dans la liste : « {text} ».",
  "hooks.nearDuplicate": "Ressemble beaucoup à « {text} », déjà dans la liste.",
  "hooks.added": "Hook ajouté.",
  "hooks.save": "Enregistrer",
  "hooks.cancel": "Annuler",
  "hooks.more": "Actions",
  "hooks.usedIn": "utilisé {when}",
  "hooks.addedWhen": "ajouté {when}",
  "hooks.suggestTitle": "Proposer des hooks",
  "hooks.suggestHint": "Gemini reçoit toute ta liste et n'y revient jamais. Garde ceux qui te plaisent, ou utilise-en un tout de suite.",
  "hooks.suggestDirection": "Orientation (facultatif)",
  "hooks.suggestDirectionPlaceholder": "ex. erreurs d'arrosage, plantes pour débutants, format POV…",
  "hooks.suggestPlant": "Plante (facultatif)",
  "hooks.anyPlant": "Toutes les plantes",
  "hooks.suggest": "Proposer {n} hooks",
  "hooks.suggestAgain": "D'autres idées",
  "hooks.suggesting": "Gemini cherche des idées neuves…",
  "hooks.suggestNone": "Rien de neuf cette fois. Réessaie, ou change l'orientation.",
  "hooks.keep": "Garder",
  "hooks.kept": "Gardé",
  "hooks.keepAll": "Tout garder",
  "hooks.useNow": "Utiliser",
  "hooks.viewTiers": "Tier list",
  "hooks.viewList": "Liste",
  "hooks.sourceAll": "Toutes sources",
  "hooks.sourceOnlySpy": "Comptes suivis",
  "hooks.sourceOurs": "Les nôtres",
  "hooks.allAccounts": "Tous les comptes",
  "hooks.allFormats": "Tous les formats",
  "hooks.formatList": "Liste",
  "hooks.formatMistakes": "Erreurs / mythes",
  "hooks.formatTip": "Astuce",
  "hooks.formatTransformation": "Avant / après",
  "hooks.formatPov": "POV",
  "hooks.formatQuestion": "Question",
  "hooks.formatStory": "Histoire perso",
  "hooks.formatOther": "Autre",
  "hooks.sortViews": "Vues",
  "hooks.sortPerf": "Surperformance",
  "hooks.sortEngagement": "Engagement",
  "hooks.sortRecent": "Plus récents",
  "hooks.tierHint": "Les hooks des comptes suivis, classés par les vues du carrousel qu'ils ouvraient : S = le top 10 %, D = le dernier sixième. Clique sur un hook pour tout voir.",
  "hooks.tierFloor": "dès {n} vues",
  "hooks.tierEmpty": "Rien dans ce rang avec ces filtres.",
  "hooks.noStats": "Sans stats : tes idées et celles de Gemini",
  "hooks.unread": "{n} couverture(s) du spy pas encore lue(s) : leurs hooks ne sont pas encore dans la liste.",
  "hooks.readNow": "Les lire maintenant",
  "hooks.reading": "Lecture en cours, {n} restante(s)…",
  "hooks.original": "Original",
  "hooks.perf": "les vues habituelles de ce compte",
  "hooks.perfShort": "vs compte",
  "hooks.detailTitle": "Hook",
  "hooks.useThis": "Utiliser ce hook",
  "hooks.rebuild": "Refaire ce carrousel",
  "hooks.postProcessed": "Ce carrousel a déjà été refait.",
  "hooks.postDismissed": "Ce carrousel a été écarté dans le Spy.",
  "hooks.viewPost": "Voir le carrousel sur TikTok",
  "hooks.postedBy": "@{name} · publié {when}",
  "hooks.suggestToggle": "Proposer avec Gemini",
  "hooks.suggestHide": "Masquer Gemini",
  "hooks.views": "vues",
  "hooks.format": "Format",
  "hooks.slides": "Les slides",
  "hooks.stats": "Ce qu'il a fait",
  "hooks.shown": "{n} hook(s)",
  "spy.hook": "Hook",

  "carousels.hooksButton": "Hooks",
  "carousels.hooksIdeas": "Tes idées gardées",
  "carousels.hooksNoIdeas": "Aucune idée gardée pour l'instant.",
  "carousels.hooksManage": "Gérer tous mes hooks",
  "carousels.hooksClose": "Fermer",

  "spy.title": "Spy",
  "spy.subtitle": "Les carrousels publiés par les comptes que tu surveilles, avec leurs chiffres. Refais à ta sauce ceux qui marchent.",
  "spy.tabInbox": "À traiter",
  "spy.tabDone": "Déjà traités",
  "spy.tabAccounts": "Comptes",
  "spy.lastRun": "Dernier passage {when} : {found} carrousels vus, {added} nouveaux.",
  "spy.lastRunRunning": "Un passage est en cours depuis {when}.",
  "spy.lastRunErrors": "À vérifier : {names}.",
  "spy.neverRan": "Le spy n'a pas encore tourné. Il passe chaque jour à 9 h depuis ton PC ; pour le lancer tout de suite, tape « npm run spy » dans le dossier du projet.",
  "spy.stale": "Pas de passage depuis {when} : ton PC était peut-être éteint. Il rattrapera à la prochaine ouverture de session, ou tape « npm run spy » dans le dossier du projet.",
  "spy.sort": "Trier",
  "spy.sortEngagement": "Engagement",
  "spy.sortViews": "Vues",
  "spy.sortRecent": "Plus récents",
  "spy.allAccounts": "Tous les comptes",
  "spy.views": "vues",
  "spy.likes": "likes",
  "spy.comments": "commentaires",
  "spy.shares": "partages",
  "spy.saves": "enregistrements",
  "spy.engagement": "engagement",
  "spy.engagementHint": "(likes + commentaires + partages + enregistrements) ÷ vues",
  "spy.slides": "{n} slides",
  "spy.process": "Traiter",
  "spy.dismiss": "Écarter",
  "spy.restore": "Remettre à traiter",
  "spy.openTikTok": "Voir sur TikTok",
  "spy.openCarousel": "Ouvrir dans Carrousels",
  "spy.badgeProcessed": "Traité",
  "spy.badgeDismissed": "Écarté",
  "spy.inboxEmpty": "Rien à traiter",
  "spy.inboxEmptyBody": "Les nouveaux carrousels des comptes surveillés arrivent ici après chaque passage du spy.",
  "spy.doneEmpty": "Rien de traité pour l'instant",
  "spy.doneEmptyBody": "Les carrousels traités ou écartés se rangent ici, pour ne plus revenir dans la liste.",
  "spy.posted": "publié {when}",
  "spy.seeAll": "Tout le Spy",
  "spy.slideAlt": "Slide {n}",
  "spy.accountsHint": "Le script de ton PC visite ces comptes chaque jour. Ajoute, retire ou mets en pause ici : il suit tout seul au passage suivant.",
  "spy.addAccount": "Ajouter",
  "spy.addPlaceholder": "@compte ou lien du profil TikTok",
  "spy.accountAdded": "@{name} sera visité au prochain passage.",
  "spy.pause": "Mettre en pause",
  "spy.resume": "Reprendre",
  "spy.paused": "En pause",
  "spy.removeAccount": "Retirer",
  "spy.confirmRemove": "Confirmer",
  "spy.followers": "{n} abonnés",
  "spy.checked": "visité {when}",
  "spy.neverChecked": "pas encore visité",
  "spy.statusOk": "{n} carrousel(s) sur 14 jours",
  "spy.statusEmpty": "aucun carrousel ces 14 derniers jours",
  "spy.statusError": "erreur : {message}",
  "spy.accountsEmpty": "Aucun compte suivi pour l'instant.",
  "spy.notePlaceholder": "Note",
  "spy.accountCount": "{n} comptes suivis",
  "spy.processTitle": "Refaire ce carrousel",
  "spy.processBody": "Chaque slide est relue par Gemini : son image est refaite, son texte réécrit dans ta voix et tes langues, et chaque photo classée dans la bibliothèque avec sa plante. Le carrousel arrive ensuite dans Carrousels, prêt à retoucher et publier.",
  "spy.imageMode": "Images",
  "spy.imageClean": "Photo d'origine nettoyée",
  "spy.imageCleanHint": "La même photo, son texte et tout ce qui vient de l'app effacés.",
  "spy.imagePexels": "Nouvelle photo (Pexels + Gemini)",
  "spy.imagePexelsHint": "Une vraie photo du même sujet trouvée sur Pexels, retravaillée par Gemini, comme tes carrousels.",
  "spy.noPexels": "PEXELS_API_KEY manque : seule la photo d'origine nettoyée est possible.",
  "spy.processStart": "Lancer",
  "spy.processStarted": "C'est parti : le carrousel se prépare dans Carrousels.",
  "spy.goCarousels": "Voir dans Carrousels",
  "spy.cancel": "Annuler",

  "repost.fromSpy": "Depuis le Spy",
  "repost.fromSpyHint": "Les carrousels repérés sur les comptes que tu surveilles, les plus engageants d'abord. « Traiter » utilise les langues, le style et le mode d'image choisis juste au-dessus.",
  "repost.fromSpyEmpty": "Rien de nouveau dans le Spy pour l'instant.",
  "repost.fromShots": "Ou à partir de captures d'écran",
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
