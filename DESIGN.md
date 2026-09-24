# Design system

Everything here is **measured from plenova.fr**, not invented. The studio and
the app it feeds should read as one product, so when something is ambiguous the
tiebreaker is "what does plenova.fr do".

Tokens live in `app/globals.css` under `@theme`. Components live in
`components/ui/index.tsx`. Nothing should hardcode a colour, a radius or a
shadow outside those two files.

---

## Palette

| Token | Light | Role |
| --- | --- | --- |
| `--color-canvas` | `#F2F8F0` | The page. A pale green, never white. |
| `--color-surface` | `#FFFFFF` | Cards, inputs, the sidebar. |
| `--color-surface-muted` | `#E8F1E4` | Soft panels, hover, expanded rows. |
| `--color-line` | `#DBE7D6` | Hairlines and card borders. |
| `--color-line-strong` | `#C4D6BD` | Input borders — visible at rest. |
| `--color-ink` | `#0E1A0C` | Body and headings. Near-black **green**. |
| `--color-ink-soft` | `#3A463A` | Secondary text worth reading. |
| `--color-ink-faint` | `#6B7869` | Meta, hints, counts. |
| `--color-ink-fill` | `#0E1A0C` | The strongest button fill on the site. |
| `--color-accent` | `#2D6B5E` | The one green. Fills and focus rings. |
| `--color-accent-soft` | `#E3ECDF` | Its wash: active chips, selected nav. |
| `--color-accent-ink` | `#174238` | Text **on** that wash. |
| `--color-warn` | `#B07617` | The site's amber, its only non-green. |
| `--color-warn-soft` | `#FDF4E3` | Warm cream behind a warning. |
| `--color-danger` | `#B4402F` | Destructive and failed. |
| `--color-danger-soft` | `#FBEAE7` | Behind a failure notice. |

Dark mode redefines every one of these in the same hues — inverted grounds, not
a neutral grey theme. A green product should stay green in the dark.

**Never use pure black, pure grey or a stock Tailwind colour.** `text-gray-500`
in this codebase is a bug.

## Typography

Inter, loaded through `next/font/google` in `app/layout.tsx` and bound to
`--font-sans`.

| Use | Setting |
| --- | --- |
| Page title | 30px / `font-extrabold` / `tracking-[-0.03em]` |
| Section heading | 17px / `font-semibold` / `tracking-[-0.01em]` |
| Body | 14px / regular / `--color-ink` |
| Secondary | 13.5px / regular / `--color-ink-soft` |
| Meta, hints | 12–12.5px / `--color-ink-faint` |
| Eyebrow / group label | 11px / `font-semibold` / `uppercase` / `tracking-[0.06em]` |

plenova.fr sets its display type heavy and tight — weight 800 with roughly
`-0.04em`. Page titles follow that; nothing else needs to.

## Geometry

The site's signature is the **pill**: 251 elements on the home page use a fully
rounded radius. Follow it.

- `--radius-pill` (9999px) — every button, chip, badge, tag, toggle.
- `--radius-card` (20px) — cards, dialogs, panels, empty states.
- `--radius-control` (12px) — inputs, selects, textareas. Rectangles with soft
  corners, because a pill-shaped text field is hard to read.

## Elevation

```css
--shadow-card:   0 1px 2px rgb(29 47 27 / .04), 0 10px 24px -18px rgb(29 47 27 / .45);
--shadow-raised: 0 1px 2px rgb(23 66 56 / .06), 0 14px 32px -16px rgb(23 66 56 / .35);
```

Both are **green-tinted**. A neutral grey shadow on the pale green canvas reads
as dirt. `--shadow-card` for anything resting on the page, `--shadow-raised`
for anything floating above it (menus, dialogs).

## Components

Use these rather than restyling a `<div>`:

| Component | Notes |
| --- | --- |
| `Card` | Surface + border + `--shadow-card` + 20px radius. |
| `Button` | Variants `primary` (accent) · `ink` (near-black, the strongest) · `secondary` · `ghost` · `danger`. Sizes `md` / `sm`. Always a pill. |
| `Field` | Label + control + optional hint. Every control belongs in one. |
| `Input` / `Select` / `Textarea` | Share the `.input` class. |
| `Badge` | A fact, not an action. |
| `StatusBadge` | A `PinStatus`, translated and colour-coded. |
| `PlantName` | A species, named both ways. See below. |
| `Notice` | `info` / `warn` / `danger`. |
| `EmptyState` | Title + description + optional action. |
| `RowMenu` / `RowMenuItem` | The `⋯` overflow menu on a list row. |
| `Spinner` | Inside a loading button, or on its own. |

## Rules that keep screens consistent

1. **One primary action per panel.** Everything else is `secondary`, `ghost`,
   or behind a `RowMenu`. If two buttons look equally important, neither reads
   as the thing to do.
2. **A disabled button says why**, in a 12.5px `--color-ink-faint` line
   directly beneath it. Compute one reason, in one place, in priority order.
3. **The reason a control is blocked goes above it**, never below — it is what
   decides whether pressing it is even possible.
4. **Every plant is named twice**, via `PlantName` (common name, then botanical)
   or `identity.label` where only one line fits. A species the catalog does not
   carry says so rather than showing an invented botanical name.
5. **Explanatory prose earns its place or goes.** A tab label, a field label and
   a hint usually already say it.
6. **Meta belongs on one line**, comma- or `·`-separated, in `--color-ink-faint`
   — not as a column of badges, which is what opens gaps in a row.
7. **Layout is a grid, not a wrapping flex row.** `flex-1` between fixed ends is
   what produced the empty bands the owner complained about.
8. **Anything a screen reader hears is French too** — `aria-label`, `alt`,
   `title`.

## Adding to the system

A new colour, radius or shadow goes in `@theme` first, with a comment saying
what it is for. A component used on two screens goes in `components/ui`. If you
find yourself copying a class string, that is the signal.
