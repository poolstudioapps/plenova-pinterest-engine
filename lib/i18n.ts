/**
 * Bilingual support (FR / EN).
 *
 * Two distinct concerns share this module:
 *  1. UI language  - what the operator sees in the dashboard.
 *  2. Pin language - what Gemini writes into the Pin, which drives which
 *     Pinterest audience the content reaches.
 *
 * They are deliberately independent: an English-speaking operator may well be
 * producing French Pins, and vice versa.
 *
 * Plant care facts stay canonical in English in the catalog and are handed to
 * the model as reference data. The model writes the Pin in the target locale.
 * That avoids maintaining 50 plants x 6 care fields in two languages, where
 * translation drift would silently degrade horticultural accuracy.
 * What IS translated is the plant *name*, because French common names differ
 * substantially and are what people actually search on Pinterest.
 */

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

/** Full language name handed to the model, plus market context. */
export const LOCALE_WRITING: Record<Locale, { language: string; market: string }> = {
  en: {
    language: "English",
    market:
      "English-speaking Pinterest users (UK, US, Canada, Australia). Use natural British-neutral English.",
  },
  fr: {
    language: "French",
    market:
      "French-speaking Pinterest users (France, Belgium, Switzerland, Quebec). Use natural, idiomatic French - never a literal translation from English.",
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function coerceLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Picks the localized string from a `{ en, fr }` pair. */
export function pick<T>(record: Record<Locale, T>, locale: Locale): T {
  return record[locale] ?? record[DEFAULT_LOCALE];
}

export const LOCALE_COOKIE = "plenova_locale";

/* ------------------------------------------------------------ dictionary -- */

type Dict = Record<string, string>;

const EN: Dict = {
  "nav.dashboard": "Dashboard",
  "nav.generate": "Generate",
  "nav.library": "Library",
  "nav.queue": "Queue",
  "nav.pinterest": "Pinterest",
  "nav.media": "Images",

  "media.title": "Image library",
  "media.subtitle":
    "Every image the engine has generated, filed by plant and cultivar. Reuse one instead of paying for a new generation.",
  "media.empty": "No images yet",
  "media.emptyBody":
    "Generate a Pin and its image lands here automatically, filed under its plant.",
  "media.allPlants": "All plants",
  "media.search": "Search plant, cultivar or prompt",
  "media.count": "{count} images across {plants} plants",
  "media.used": "used {n}x",
  "media.reuse": "Reuse this image",
  "media.delete": "Remove from library",
  "media.noMatch": "No image matches these filters.",

  "generate.variety": "Cultivar",
  "generate.varietyHint":
    "Optional, free text - e.g. variegata, Thai Constellation. Files the image under it in the library.",
  "generate.reuse": "Reuse an existing image",
  "generate.reuseHint":
    "Skips image generation and reuses a library image for this plant.",
  "generate.reuseNone": "Generate a new image",
  "generate.reuseAvailable": "{n} available for this plant",

  "dashboard.title": "Dashboard",
  "dashboard.subtitle":
    "Generation and publishing status for the Plenova Pinterest channel.",
  "dashboard.plants": "Plants",
  "dashboard.plantsHint": "in the catalog",
  "dashboard.angles": "Content angles",
  "dashboard.anglesHint": "across 5 categories",
  "dashboard.possible": "Possible Pins",
  "dashboard.possibleHint": "per language, 4 variations per slot",
  "dashboard.generated": "Generated",
  "dashboard.generatedHint": "stored in this engine",
  "dashboard.published": "Published",
  "dashboard.queued": "Queued",
  "dashboard.scheduled": "Scheduled",
  "dashboard.failed": "Failed",
  "dashboard.media": "Library images",
  "dashboard.mediaHint": "reusable across channels",
  "dashboard.reuses": "Image reuses",
  "dashboard.reusesHint": "generations that skipped the image model",
  "dashboard.recent": "Recent Pins",
  "dashboard.viewLibrary": "View library",
  "dashboard.empty": "Nothing generated yet.",
  "dashboard.emptyCta": "Generate the first Pin",
  "dashboard.system": "System",
  "dashboard.gemini": "Gemini",
  "dashboard.pinterestApp": "Pinterest app",
  "dashboard.connected": "Account connected",
  "dashboard.hosting": "Public image hosting",
  "dashboard.encryption": "Token encryption",
  "dashboard.storage": "Storage",
  "dashboard.ready": "Ready",
  "dashboard.notSet": "Not set",
  "dashboard.notPersistentTitle": "Storage is not persistent",
  "dashboard.notPersistent":
    "Pins are held in memory only and will disappear when the serverless function recycles. Attach a Vercel Blob store before generating at volume.",

  "generate.title": "Generate",
  "generate.subtitle":
    "Pick a plant and a content angle. Gemini writes the copy, then paints a 2:3 visual matched to that angle.",
  "generate.plant": "Plant",
  "generate.angle": "Content angle",
  "generate.pinLanguage": "Pin language",
  "generate.pinLanguageHint":
    "The language the Pin copy is written in. Independent of the dashboard language.",
  "generate.style": "Visual style",
  "generate.styleHint":
    "Leave on Auto to let the engine pick a format that suits the angle.",
  "generate.styleAuto": "Auto",
  "generate.custom": "Custom direction",
  "generate.customHint": "Optional. Takes priority over the angle's default intent.",
  "generate.customPlaceholder":
    "e.g. focus on winter watering in a flat with no south-facing window",
  "generate.variation": "Variation",
  "generate.variationHint":
    "Each variation uses a different title structure and composition.",
  "generate.regenerate": "Regenerate over an existing Pin in this slot",
  "generate.cta": "Generate Pin",
  "generate.working": "Generating...",
  "generate.needKey": "Set GEMINI_API_KEY in your environment to enable generation.",
  "generate.failed": "Generation failed",
  "generate.duplicateHint": "Bump the variation number or tick the regenerate box.",
  "generate.unreachable":
    "Could not reach the server. Check that the dev server is running.",

  "preview.empty": "No Pin yet",
  "preview.emptyBody":
    "Pick a plant and an angle, then generate. The preview lands here at Pinterest's 2:3 ratio.",
  "preview.working":
    "Writing the copy, then painting the visual. This usually takes 20-60 seconds.",
  "preview.titleField": "Title",
  "preview.descField": "Description",
  "preview.keywords": "Keywords",
  "preview.destination": "Destination",
  "preview.board": "Pinterest board",
  "preview.selectBoard": "Select a board...",
  "preview.connectFirst": "Connect Pinterest to load boards",
  "preview.save": "Save changes",
  "preview.queue": "Add to queue",
  "preview.publish": "Publish now",
  "preview.saved": "Changes saved.",
  "preview.queued": "Added to the publishing queue.",
  "preview.notConnected":
    "Pinterest is not connected, so publishing is disabled. Everything else - generating, editing and queueing - works normally.",
  "preview.inline":
    "Stored inline - not publishable. Attach a Blob store, then regenerate.",
  "preview.lastError": "Last error",
  "preview.requestFailed": "Request failed.",
  "preview.unreachable": "Could not reach the server.",

  "library.title": "Library",
  "library.subtitle":
    "Every Pin this engine has generated, with its current publishing status.",
  "library.allPlants": "All plants",
  "library.allAngles": "All angles",
  "library.allStatuses": "All statuses",
  "library.allLanguages": "All languages",
  "library.allVarieties": "All cultivars",
  "library.search": "Search title, copy or keywords",
  "library.count": "{shown} of {total} Pins",
  "library.editing": "Editing",
  "library.close": "Close",
  "library.edit": "Edit",
  "library.delete": "Delete",
  "library.empty": "No Pins yet",
  "library.emptyBody":
    "Generated Pins are stored here with their status, so you can review, edit and publish them later.",
  "library.emptyCta": "Generate a Pin",
  "library.noMatch": "No matches",
  "library.noMatchBody":
    "No Pin matches the current filters. Try clearing the search or status.",

  "queue.title": "Queue",
  "queue.subtitle":
    "Pins waiting to be published. The Vercel cron worker drains this hourly in small batches.",
  "queue.empty": "Queue is empty",
  "queue.emptyBody":
    "Generate a Pin, select a board, then add it to the queue to schedule publishing.",
  "queue.noCronTitle": "Cron worker is not armed",
  "queue.noCron":
    "Set CRON_SECRET in the Vercel project so the scheduled publisher can authenticate. Until then, publish manually from the Library.",
  "queue.noBoard": "No board selected",
  "queue.board": "Board",
  "queue.attempts": "attempt(s)",

  "pinterest.title": "Pinterest",
  "pinterest.subtitle":
    "Connect the Plenova Pinterest account so the engine can read boards and publish Pins.",
  "pinterest.connection": "Connection",
  "pinterest.connectBody":
    "Authorise the Plenova Pinterest account. Tokens are encrypted before storage and never reach the browser.",
  "pinterest.connect": "Connect Pinterest",
  "pinterest.disconnect": "Disconnect",
  "pinterest.connectedAt": "Connected",
  "pinterest.expires": "token expires",
  "pinterest.boards": "Boards",
  "pinterest.loadingBoards": "Loading boards...",
  "pinterest.noBoards": "No boards found",
  "pinterest.noBoardsBody": "Create a board on Pinterest, then reload this page.",
  "pinterest.config": "App configuration",
  "pinterest.redirectUri": "Redirect URI",
  "pinterest.redirectHint":
    "This must match the value registered on the Pinterest app exactly.",
  "pinterest.scopes": "Requested scopes",
  "pinterest.apiBase": "API base",
  "pinterest.destination": "Pin destination",
  "pinterest.notConfigured": "Pinterest credentials are not set",
  "pinterest.noHostingTitle": "No public image hosting",
  "pinterest.noHosting":
    "Pinterest fetches Pin images by URL. Attach a Vercel Blob store so generated images get a public URL; until then Pins can be generated and reviewed but not published.",
  "pinterest.connectedTitle": "Account connected",
  "pinterest.connectedBody":
    "The Pinterest account is linked and boards are now available in the generator.",
  "pinterest.failedTitle": "Connection failed",
  "pinterest.trialTitle": "Read-only trial token in use",
  "pinterest.trialBody":
    "The engine is authenticated with a manually supplied trial token. Boards can be read, but publishing needs the pins:write scope, which trial access does not grant.",

  "login.intro":
    "Internal content studio for Plenova, a houseplant care app. It generates plant-care images and copy, and publishes them to our own Pinterest and TikTok accounts. Access is restricted to authorised staff.",
  "login.terms": "Terms of Service",
  "login.privacy": "Privacy Policy",
  "login.password": "Password",
  "login.cta": "Sign in",
  "login.failed": "Incorrect password.",

  "common.language": "Language",
  "common.uiLanguage": "Dashboard language",
};

const FR: Dict = {
  "nav.dashboard": "Tableau de bord",
  "nav.generate": "Générer",
  "nav.library": "Bibliothèque",
  "nav.queue": "File d'attente",
  "nav.pinterest": "Pinterest",
  "nav.media": "Images",

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
};

const DICTIONARIES: Record<Locale, Dict> = { en: EN, fr: FR };

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/** Returns a translator. Missing keys fall back to English, then to the key. */
export function translator(locale: Locale): Translator {
  const dict = DICTIONARIES[locale] ?? EN;
  return (key, vars) => {
    let out = dict[key] ?? EN[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v));
      }
    }
    return out;
  };
}
