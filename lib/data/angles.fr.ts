/**
 * French labels for content angles and visual styles.
 *
 * Only the operator-facing labels are translated. `intent` and
 * `sceneDirection` stay English because they are model-facing instructions,
 * not UI copy - the model receives them in English and writes the Pin in the
 * requested locale.
 */

export const ANGLE_LABELS_FR: Record<string, string> = {
  // Care
  "complete-care-guide": "Guide d'entretien complet",
  "beginner-care-guide": "Guide pour débutants",
  "watering-guide": "Guide d'arrosage",
  "light-requirements": "Besoins en lumière",
  "humidity-requirements": "Besoins en humidité",
  "fertilizing-guide": "Guide de fertilisation",
  "repotting-guide": "Guide de rempotage",
  "pruning-guide": "Guide de taille",
  "propagation-guide": "Guide de bouturage",
  "soil-and-potting": "Terreau & substrat",

  // Problems
  "yellow-leaves": "Feuilles jaunes",
  "brown-leaves": "Feuilles & pointes brunes",
  "drooping-leaves": "Feuilles tombantes",
  "curling-leaves": "Feuilles qui s'enroulent",
  "root-rot": "Pourriture des racines",
  overwatering: "Excès d'arrosage",
  underwatering: "Manque d'arrosage",
  pests: "Nuisibles",
  "slow-growth": "Croissance lente",
  "leaf-spots": "Taches sur les feuilles",
  wilting: "Flétrissement",

  // Mistakes
  "common-mistakes": "Erreurs fréquentes",
  "beginner-mistakes": "5 erreurs de débutant",
  "things-this-plant-hates": "Ce que cette plante déteste",
  "signs-of-overwatering": "Signes d'un arrosage excessif",
  "signs-of-underwatering": "Signes d'un manque d'eau",
  "stop-doing-this": "Ce qu'il faut arrêter de faire",

  // Discovery
  "best-low-light-plants": "Meilleures plantes pour faible luminosité",
  "best-beginner-plants": "Meilleures plantes pour débuter",
  "easy-indoor-plants": "Plantes d'intérieur faciles",
  "pet-friendly-plants": "Plantes sans danger pour les animaux",
  "plants-for-apartments": "Plantes pour appartement",
  "plants-for-bathrooms": "Plantes pour salle de bain",
  "plants-for-bedrooms": "Plantes pour chambre",
  "plants-for-offices": "Plantes pour le bureau",
  "fast-growing-plants": "Plantes à croissance rapide",
  "humidity-loving-plants": "Plantes qui aiment l'humidité",

  // Seasonal
  "spring-care": "Entretien au printemps",
  "summer-care": "Entretien en été",
  "fall-care": "Entretien en automne",
  "winter-care": "Entretien en hiver",
  "seasonal-watering": "Arrosage selon la saison",
  "winter-humidity": "Humidité en hiver",
  "spring-repotting": "Rempotage de printemps",
};

export const ANGLE_CATEGORY_LABELS_FR: Record<string, string> = {
  care: "Entretien",
  problems: "Problèmes",
  mistakes: "Erreurs",
  discovery: "Découverte / SEO",
  seasonal: "Saisonnier",
};

export const VISUAL_STYLE_LABELS_FR: Record<string, string> = {
  "editorial-photo": "Photo éditoriale",
  "close-up-detail": "Gros plan détail",
  "typography-overlay": "Plante + typographie",
  "before-after": "Avant / après",
  "problem-focused": "Centré sur le problème",
  "step-by-step": "Étape par étape",
  checklist: "Check-list",
  "minimal-infographic": "Infographie minimale",
  "plant-in-interior": "Plante en intérieur",
  "care-card": "Fiche d'entretien",
};
