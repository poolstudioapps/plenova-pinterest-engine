/**
 * French plant names.
 *
 * Kept in a separate map rather than inlined in the catalog so the English
 * catalog stays the single canonical source of care data, and so a missing
 * translation is a visible gap rather than a silently half-translated record.
 *
 * `name` is the primary term shown in the UI and handed to the copy model.
 * `aka` holds the other common French names people actually type into
 * Pinterest search - the model is told it may use them naturally, which is
 * worth real reach on plants like "langue de belle-mère" or "fleur de lune".
 */
export interface PlantFr {
  name: string;
  aka?: string[];
}

export const PLANTS_FR: Record<string, PlantFr> = {
  "monstera-deliciosa": {
    name: "Monstera deliciosa",
    aka: ["faux philodendron", "plante gruyère"],
  },
  "monstera-adansonii": {
    name: "Monstera adansonii",
    aka: ["monstera à trous", "plante gruyère"],
  },
  pothos: { name: "Pothos", aka: ["scindapsus", "lierre du diable"] },
  "golden-pothos": { name: "Pothos doré", aka: ["scindapsus doré"] },
  "marble-queen-pothos": { name: "Pothos Marble Queen" },
  "philodendron-hederaceum": {
    name: "Philodendron grimpant",
    aka: ["philodendron cordé"],
  },
  "philodendron-birkin": { name: "Philodendron Birkin" },
  "philodendron-brasil": { name: "Philodendron Brasil" },
  "snake-plant": {
    name: "Sansevieria",
    aka: ["langue de belle-mère", "plante serpent"],
  },
  "zz-plant": { name: "Plante ZZ", aka: ["zamioculcas"] },
  "peace-lily": { name: "Spathiphyllum", aka: ["fleur de lune"] },
  "fiddle-leaf-fig": { name: "Figuier lyre", aka: ["ficus lyrata"] },
  "rubber-plant": { name: "Ficus elastica", aka: ["caoutchouc", "figuier élastique"] },
  "spider-plant": {
    name: "Plante araignée",
    aka: ["chlorophytum", "phalangère"],
  },
  "pilea-peperomioides": {
    name: "Pilea",
    aka: ["plante à monnaie chinoise", "plante des missionnaires"],
  },
  calathea: { name: "Calathea", aka: ["plante paon"] },
  "prayer-plant": { name: "Maranta", aka: ["plante qui prie"] },
  "aloe-vera": { name: "Aloe vera" },
  "jade-plant": { name: "Arbre de jade", aka: ["crassula"] },
  "string-of-pearls": {
    name: "Collier de perles",
    aka: ["séneçon de Rowley"],
  },
  "string-of-hearts": {
    name: "Chaîne des cœurs",
    aka: ["ceropegia", "collier de cœurs"],
  },
  "english-ivy": { name: "Lierre commun", aka: ["hedera helix"] },
  "boston-fern": { name: "Fougère de Boston", aka: ["néphrolépis"] },
  "bird-of-paradise": { name: "Oiseau de paradis", aka: ["strelitzia"] },
  croton: { name: "Croton", aka: ["codiaeum"] },
  dieffenbachia: { name: "Dieffenbachia", aka: ["canne des muets"] },
  "dracaena-marginata": { name: "Dracaena marginata", aka: ["dragonnier"] },
  yucca: { name: "Yucca" },
  "areca-palm": { name: "Palmier areca", aka: ["areca", "palmier d'or"] },
  "parlor-palm": { name: "Palmier nain", aka: ["chamaedorea", "palmier de salon"] },
  anthurium: { name: "Anthurium", aka: ["langue de feu", "flamant rose"] },
  "anthurium-crystallinum": { name: "Anthurium crystallinum" },
  "begonia-maculata": { name: "Bégonia maculata", aka: ["bégonia à pois"] },
  orchid: { name: "Orchidée Phalaenopsis", aka: ["orchidée papillon"] },
  "african-violet": { name: "Violette africaine", aka: ["saintpaulia"] },
  peperomia: { name: "Peperomia" },
  "hoya-carnosa": { name: "Hoya", aka: ["fleur de porcelaine", "fleur de cire"] },
  "tradescantia-zebrina": { name: "Misère", aka: ["tradescantia zebrina"] },
  fittonia: { name: "Fittonia", aka: ["plante mosaïque", "plante nerf"] },
  syngonium: { name: "Syngonium", aka: ["plante flèche"] },
  schefflera: { name: "Schefflera", aka: ["arbre ombrelle", "plante parapluie"] },
  "lucky-bamboo": { name: "Bambou de la chance", aka: ["dracaena sanderiana"] },
  "ponytail-palm": { name: "Beaucarnea", aka: ["pied d'éléphant"] },
  "christmas-cactus": { name: "Cactus de Noël", aka: ["schlumbergera"] },
  "string-of-turtles": {
    name: "Collier de tortues",
    aka: ["peperomia prostrata"],
  },
  "birds-nest-fern": { name: "Fougère nid d'oiseau", aka: ["asplenium"] },
  "maidenhair-fern": { name: "Capillaire", aka: ["adiantum", "cheveux de Vénus"] },
  alocasia: { name: "Alocasia", aka: ["oreille d'éléphant"] },
  "cast-iron-plant": { name: "Aspidistra", aka: ["plante de fer"] },
  "rex-begonia": { name: "Bégonia rex" },
};
