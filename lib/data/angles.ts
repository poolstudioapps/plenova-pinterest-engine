import type { AngleCategory, ContentAngle } from "@/lib/types";

/**
 * Content angles (spec §7).
 *
 * Each angle carries two distinct instructions:
 *  - `intent` steers the copy model toward a specific search intent.
 *  - `sceneDirection` steers the image model toward a distinct composition, so
 *    "yellow leaves" never renders the same frame as "complete care guide"
 *    (spec §10: avoid repeating the same composition).
 *
 * Adding an angle is a one-object change - nothing else in the engine needs to
 * know about it.
 */
export const ANGLES: ContentAngle[] = [
  // ---------------------------------------------------------------- care ---
  {
    slug: "complete-care-guide",
    label: "Complete care guide",
    category: "care",
    intent:
      "A complete but skimmable care overview: light, water, humidity, soil and feeding.",
    sceneDirection:
      "a thriving, perfectly healthy specimen as the hero of a bright, styled interior",
  },
  {
    slug: "beginner-care-guide",
    label: "Beginner care guide",
    category: "care",
    intent:
      "The three or four things a first-time owner actually needs to get right.",
    sceneDirection:
      "a young, compact plant in a simple ceramic pot on a clean surface, approachable and unintimidating",
  },
  {
    slug: "watering-guide",
    label: "Watering guide",
    category: "care",
    intent:
      "How often to water, how to tell it is thirsty, and how the season changes the answer.",
    sceneDirection:
      "the plant beside a watering can with soft water droplets on the foliage, still elegant and editorial",
  },
  {
    slug: "light-requirements",
    label: "Light requirements",
    category: "care",
    intent: "Exactly where to place it relative to a window, and the signs of wrong light.",
    sceneDirection:
      "strong directional window light raking across the plant, with visible light and shadow separation",
  },
  {
    slug: "humidity-requirements",
    label: "Humidity requirements",
    category: "care",
    intent: "The humidity it needs and practical ways to raise it at home.",
    sceneDirection:
      "the plant in a softly humid setting, gentle mist in the air, fine water beads on the leaves",
  },
  {
    slug: "fertilizing-guide",
    label: "Fertilizing guide",
    category: "care",
    intent: "When to feed, what strength, and when to stop entirely.",
    sceneDirection:
      "the plant with a small bottle of liquid fertiliser and a measuring cap on a clean surface",
  },
  {
    slug: "repotting-guide",
    label: "Repotting guide",
    category: "care",
    intent: "How to know it is pot-bound, when to repot, and the step order.",
    sceneDirection:
      "a repotting scene with fresh potting mix, an empty terracotta pot and exposed healthy roots",
  },
  {
    slug: "pruning-guide",
    label: "Pruning guide",
    category: "care",
    intent: "Where to cut, why, and what it triggers in the plant.",
    sceneDirection:
      "clean pruning shears next to the plant, one stem being trimmed, tidy and precise",
  },
  {
    slug: "propagation-guide",
    label: "Propagation guide",
    category: "care",
    intent: "Turning one plant into several: cutting, rooting and potting up.",
    sceneDirection:
      "cuttings rooting in clear glass vessels with visible white roots in water, on a bright windowsill",
  },
  {
    slug: "soil-and-potting",
    label: "Soil & potting mix",
    category: "care",
    intent: "The right mix and drainage, and why standard potting soil often fails.",
    sceneDirection:
      "a flat-lay of potting mix components - bark, perlite, coco coir - beside the plant",
  },

  // ------------------------------------------------------------ problems ---
  {
    slug: "yellow-leaves",
    label: "Yellow leaves",
    category: "problems",
    intent:
      "Diagnose yellowing by pattern and location, ordered from most to least likely cause.",
    sceneDirection:
      "a tight detail shot of a few distinctly yellowing leaves on an otherwise healthy plant",
  },
  {
    slug: "brown-leaves",
    label: "Brown leaves & tips",
    category: "problems",
    intent: "What browning edges and tips mean, and how to stop the spread.",
    sceneDirection:
      "a macro close-up of a leaf with dry brown crispy edges, shallow depth of field",
  },
  {
    slug: "drooping-leaves",
    label: "Drooping leaves",
    category: "problems",
    intent: "Telling thirst-droop from root-rot-droop, and what to do for each.",
    sceneDirection:
      "the plant visibly wilting with limp, downward-hanging foliage in soft light",
  },
  {
    slug: "curling-leaves",
    label: "Curling leaves",
    category: "problems",
    intent: "Why leaves curl inward or outward and the fix for each direction.",
    sceneDirection:
      "a detail of leaves curling at the edges, side-lit to make the curl read clearly",
  },
  {
    slug: "root-rot",
    label: "Root rot",
    category: "problems",
    intent: "Spotting it early, and the rescue procedure step by step.",
    sceneDirection:
      "a plant lifted from its pot on newspaper with the root ball exposed, dark soil visible",
  },
  {
    slug: "overwatering",
    label: "Overwatering",
    category: "problems",
    intent: "The signs of too much water and how to recover the plant.",
    sceneDirection:
      "waterlogged soil surface with a saucer of standing water beneath the pot",
  },
  {
    slug: "underwatering",
    label: "Underwatering",
    category: "problems",
    intent: "The signs of drought stress and how to rehydrate properly.",
    sceneDirection:
      "visibly dry cracked soil pulling away from the pot edge, slightly limp foliage",
  },
  {
    slug: "pests",
    label: "Pests",
    category: "problems",
    intent: "Identifying the usual suspects and treating them without harsh chemicals.",
    sceneDirection:
      "an extreme macro of a leaf underside showing fine webbing and tiny pests, clinical and sharp",
  },
  {
    slug: "slow-growth",
    label: "Slow growth",
    category: "problems",
    intent: "Why it stalled and the levers that actually restart growth.",
    sceneDirection:
      "a small, static-looking plant in an oversized pot, plenty of negative space",
  },
  {
    slug: "leaf-spots",
    label: "Leaf spots",
    category: "problems",
    intent: "Distinguishing fungal, bacterial and physical damage spots.",
    sceneDirection:
      "a macro detail of dark spots with defined margins on a green leaf surface",
  },
  {
    slug: "wilting",
    label: "Wilting",
    category: "problems",
    intent: "Emergency triage for a collapsing plant.",
    sceneDirection:
      "a dramatically wilted plant, slightly desaturated, moody low-key lighting",
  },

  // ------------------------------------------------------------ mistakes ---
  {
    slug: "common-mistakes",
    label: "Common mistakes",
    category: "mistakes",
    intent: "The handful of errors that kill most of these plants.",
    sceneDirection:
      "a healthy plant beside a visibly struggling one, contrast composition",
  },
  {
    slug: "beginner-mistakes",
    label: "5 mistakes beginners make",
    category: "mistakes",
    intent: "Exactly five specific, correctable beginner errors.",
    sceneDirection:
      "an overhead flat-lay of the plant with watering can, shears and pot arranged like a checklist",
  },
  {
    slug: "things-this-plant-hates",
    label: "Things this plant hates",
    category: "mistakes",
    intent: "The specific conditions this species will not tolerate.",
    sceneDirection:
      "the plant near a cold draughty window or a radiator, tense and slightly moody light",
  },
  {
    slug: "signs-of-overwatering",
    label: "Signs you're overwatering",
    category: "mistakes",
    intent: "A symptom checklist for too much water, in order of appearance.",
    sceneDirection:
      "a detail of soggy soil with yellowing lower leaves in the same frame",
  },
  {
    slug: "signs-of-underwatering",
    label: "Signs you're underwatering",
    category: "mistakes",
    intent: "A symptom checklist for drought stress.",
    sceneDirection:
      "dry soil and slightly curled, dull foliage in warm afternoon light",
  },
  {
    slug: "stop-doing-this",
    label: "Things to stop doing",
    category: "mistakes",
    intent: "Popular plant-care advice that actively harms this species.",
    sceneDirection:
      "a clean minimal composition of the plant with strong negative space for a typographic overlay",
  },

  // ----------------------------------------------------------- discovery ---
  {
    slug: "best-low-light-plants",
    label: "Best plants for low light",
    category: "discovery",
    intent:
      "Why this plant is a genuinely good low-light pick, with an honest limit.",
    sceneDirection:
      "the plant thriving in a cosy, dim corner far from the window, warm lamp light",
    speciesAgnostic: true,
  },
  {
    slug: "best-beginner-plants",
    label: "Best plants for beginners",
    category: "discovery",
    intent: "Why it forgives mistakes, and the one thing you still must not do.",
    sceneDirection:
      "a cheerful, robust plant in a bright, uncluttered modern room",
    speciesAgnostic: true,
  },
  {
    slug: "easy-indoor-plants",
    label: "Easy indoor plants",
    category: "discovery",
    intent: "Minimum viable care for a genuinely low-effort plant.",
    sceneDirection: "an effortless, healthy plant styled on a simple wooden shelf",
    speciesAgnostic: true,
  },
  {
    slug: "pet-friendly-plants",
    label: "Pet-friendly plants",
    category: "discovery",
    intent:
      "Whether this plant is safe around cats and dogs - state the truth plainly.",
    sceneDirection:
      "the plant in a warm living room with a cat resting nearby, safe and calm",
    speciesAgnostic: true,
  },
  {
    slug: "plants-for-apartments",
    label: "Plants for apartments",
    category: "discovery",
    intent: "Why it suits small, shared, low-light urban spaces.",
    sceneDirection:
      "the plant in a compact, well-designed small apartment corner",
    speciesAgnostic: true,
  },
  {
    slug: "plants-for-bathrooms",
    label: "Plants for bathrooms",
    category: "discovery",
    intent: "How bathroom humidity and light suit this plant.",
    sceneDirection:
      "the plant in a bright modern bathroom with tile, soft steam in the air",
    speciesAgnostic: true,
  },
  {
    slug: "plants-for-bedrooms",
    label: "Plants for bedrooms",
    category: "discovery",
    intent: "Why it works in a bedroom, and where to put it.",
    sceneDirection:
      "the plant on a bedside table in a calm bedroom with soft morning light",
    speciesAgnostic: true,
  },
  {
    slug: "plants-for-offices",
    label: "Plants for offices",
    category: "discovery",
    intent: "Surviving fluorescent light, dry air and weekends alone.",
    sceneDirection:
      "the plant on a tidy desk in a bright minimal workspace",
    speciesAgnostic: true,
  },
  {
    slug: "fast-growing-plants",
    label: "Fast-growing plants",
    category: "discovery",
    intent: "How fast it grows and how to push it faster.",
    sceneDirection:
      "a lush, visibly vigorous plant with long trailing or tall growth",
    speciesAgnostic: true,
  },
  {
    slug: "humidity-loving-plants",
    label: "Plants that love humidity",
    category: "discovery",
    intent: "Why it wants humidity and how to deliver it indoors.",
    sceneDirection:
      "the plant grouped with others in a humid, jungle-like corner",
    speciesAgnostic: true,
  },

  // ------------------------------------------------------------ seasonal ---
  {
    slug: "spring-care",
    label: "Spring plant care",
    category: "seasonal",
    intent: "Waking the plant up: light, water, feeding and repotting in spring.",
    sceneDirection:
      "fresh new growth unfurling in bright spring light, optimistic and airy",
  },
  {
    slug: "summer-care",
    label: "Summer plant care",
    category: "seasonal",
    intent: "Managing heat, faster drying and stronger light.",
    sceneDirection:
      "the plant in warm, bright summer light with lush full foliage",
  },
  {
    slug: "fall-care",
    label: "Fall plant care",
    category: "seasonal",
    intent: "Scaling care back as days shorten.",
    sceneDirection:
      "the plant in warm golden autumn light, slightly amber tones",
  },
  {
    slug: "winter-care",
    label: "Winter plant care",
    category: "seasonal",
    intent: "Surviving low light, dry heated air and cold glass.",
    sceneDirection:
      "the plant beside a frosted window in cool, soft winter daylight",
  },
  {
    slug: "seasonal-watering",
    label: "Seasonal watering",
    category: "seasonal",
    intent: "How the watering interval shifts across the four seasons.",
    sceneDirection:
      "a calm composition of the plant with a watering can and soft seasonal light",
  },
  {
    slug: "winter-humidity",
    label: "Winter humidity",
    category: "seasonal",
    intent: "Fighting the dry air that indoor heating creates.",
    sceneDirection:
      "the plant near a small humidifier releasing soft mist in cool light",
  },
  {
    slug: "spring-repotting",
    label: "Spring repotting",
    category: "seasonal",
    intent: "Why spring is the right window to repot, and how to do it.",
    sceneDirection:
      "a spring repotting scene with fresh mix, clean pots and bright natural light",
  },
];

export const ANGLES_BY_SLUG = new Map(ANGLES.map((a) => [a.slug, a]));

export function getAngle(slug: string): ContentAngle | undefined {
  return ANGLES_BY_SLUG.get(slug);
}

export const ANGLE_CATEGORIES: {
  key: AngleCategory;
  label: string;
}[] = [
  { key: "care", label: "Care" },
  { key: "problems", label: "Problems" },
  { key: "mistakes", label: "Mistakes" },
  { key: "discovery", label: "Discovery / SEO" },
  { key: "seasonal", label: "Seasonal" },
];

export function anglesByCategory(): Record<AngleCategory, ContentAngle[]> {
  const out = {
    care: [],
    problems: [],
    mistakes: [],
    discovery: [],
    seasonal: [],
  } as Record<AngleCategory, ContentAngle[]>;
  for (const angle of ANGLES) out[angle.category].push(angle);
  return out;
}
