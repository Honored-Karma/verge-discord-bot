# Design — Verge TRP Portal

A locked design system for the Verge TRP bot and web portal. Every page redesign reads this file before emitting code. Do not regenerate per page — extend or amend this file when the system needs to grow.

## Discord surface

Discord uses native components, typography and spacing. Its existing purple accent (`#b209d4`) remains the brand color for panels and generated character dossiers. The portal's Crimson Ember palette below remains unchanged. State colors, response structure and interaction rules for bot commands are documented in [docs/DISCORD_UI.md](docs/DISCORD_UI.md); shared tokens live in `utils/responseStyle.js`. CSS and web layout rules below apply to the portal, not Discord messages.

## Genre
atmospheric

## Macrostructure Families
- **Marketing pages** (`/`): Split Diptych (H2) + Bento Grid (F1) / Feature Stack
- **App pages** (`/dashboard`, `/profile`, `/characters/:id`, `/inventory`, `/applications`, `/admin/*`): Workbench (05) — functional tactical HUD, dense layout, zero decorative fluff
- **Content pages** (`/wiki`, `/wiki/*`, `/search`): Long Document (02) — typography-first, structured table of contents, 45–75ch measure

## Theme (Atmospheric Custom OKLCH)
```css
:root {
  /* Surfaces & Paper */
  --color-paper:       oklch(14% 0.012 265);
  --color-paper-2:     oklch(18% 0.015 265);
  --color-paper-3:     oklch(22% 0.018 265);
  --color-paper-hover: oklch(25% 0.020 265);

  /* Inks */
  --color-ink:         oklch(95% 0.008 265);
  --color-ink-2:       oklch(84% 0.010 265);
  --color-muted:       oklch(68% 0.012 265);
  --color-dim:         oklch(52% 0.014 265);

  /* Rules & Boundaries */
  --color-rule:        oklch(26% 0.014 265);
  --color-rule-strong: oklch(36% 0.018 265);

  /* Primary Tactical Accent (Crimson Ember) */
  --color-accent:      oklch(62% 0.22 25);
  --color-accent-ink:  oklch(98% 0 0);
  --color-accent-glow: oklch(62% 0.22 25 / 0.25);
  --color-accent-subtle: oklch(62% 0.22 25 / 0.12);

  /* Secondary Role Accents */
  --color-cyan:        oklch(74% 0.14 210);
  --color-cyan-subtle: oklch(74% 0.14 210 / 0.12);
  --color-purple:      oklch(68% 0.18 290);
  --color-purple-subtle: oklch(68% 0.18 290 / 0.12);
  --color-amber:       oklch(78% 0.16 75);
  --color-amber-subtle: oklch(78% 0.16 75 / 0.12);
  --color-emerald:     oklch(72% 0.16 155);

  /* Focus & Interactive States */
  --color-focus:       oklch(72% 0.20 25);
  --color-focus-ring:  0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-focus);
}
```

## Typography
- **Display**: `'Unbounded', sans-serif`, weight 700 / 800, roman only (Gate 38a: no italic headers!).
- **Body**: `'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`, weight 400 / 500 / 600.
- **Outlier (Mono)**: `'JetBrains Mono', monospace`, weight 500 / 600 (used strictly for AP/SP values, system metrics, command flags, timestamps — max 2 roles).
- **Display Tracking**: `-0.03em`.
- **Measure**: `max-width: 65ch` (45–75ch range) on long-form reading content.

## Spacing (4-point scale)
- `--space-3xs`: 0.25rem (4px)
- `--space-2xs`: 0.5rem (8px)
- `--space-xs`: 0.75rem (12px)
- `--space-sm`: 1rem (16px)
- `--space-md`: 1.5rem (24px)
- `--space-lg`: 2rem (32px)
- `--space-xl`: 3rem (48px)
- `--space-2xl`: 4.5rem (72px)
- `--space-3xl`: 6rem (96px)

## Motion
- `--ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)`
- `--dur-short`: `160ms`
- `--dur-normal`: `240ms`
- Reduced motion fallback: opacity-only, `≤ 120ms` (Gate 27).

## Microinteractions Stance
- Silent success: updates happen with immediate state reflection, no gratuitous celebratory toasts (Gate 16).
- 8 states implemented for all interactive elements: default, hover, focus-visible, active, disabled, loading, error, success (Gate 26 & 39).
- Single hover affordance only: no compound scale + rotate + shadow + translate + filter jumping (Gate 13).
- Focus rings appear instantly without opacity transitions (Gate 15).

## CTA Voice
- **Primary CTA**: Solid fill `--color-accent`, text `--color-accent-ink`, subtle border, trailing icon in bubble.
- **Secondary CTA**: Dark surface `--color-paper-2`, 1px rule border `--color-rule`, hover subtle shift `--color-paper-hover`.
- **Tertiary / Text CTA**: Underlined text or typographic arrow link.

## Navigation & Footer Archetypes
- **Nav**: **N13 Inline ⌘K-pill Nav** — floating compact pill island with brand mark, essential section links, inline search shortcut trigger, active character avatar/slot switcher.
- **Footer**: **Ft5 Statement Footer** — closing narrative line on the Genesis disaster and the divided world, live synchronization indicator, clean copyright and links.

## Anti-Slop Non-Negotiables (Hallmark 58 Gates)
1. No purple-to-cyan or text-gradient headers (`background-clip: text` is banned).
2. Accent footprint ≤ 5% of any viewport.
3. No 3-equal-column generic card grids.
4. No re-drawn UI chrome (fake browser traffic-light dots).
5. All interactive buttons and links remain single-line across 320px–1920px viewports (Gate 49).
6. Root `overflow-x: clip` on both `html` and `body` (Gate 34).
7. Honest copy with zero fabricated metrics (Gate 46).
8. Locked tokens: zero inline hex/oklch improvisation in component files (Gate 48).
