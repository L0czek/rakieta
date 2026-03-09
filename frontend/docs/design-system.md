# Rocket SCADA Design System

This document is the source of truth for frontend visual language.
Use semantic tokens first and avoid one-off color values in components.

## Design goals

- Prioritize legibility in dark, high-glare operator environments.
- Keep critical states obvious (`danger`, `warning`, `safe`).
- Preserve SCADA character: monospace typography, dense information, clear hierarchy.

## Typography

- Primary font stack: `var(--scada-font-primary)`
- Body copy: 12px-14px equivalent utility sizes (`text-xs`, `text-sm`)
- Numeric telemetry: monospace + bold (`font-mono font-bold`)

## Semantic color tokens

Defined in `frontend/index.css`.

| Token | Value | Usage |
|---|---|---|
| `--scada-bg-app` | `#0b1220` | App canvas background |
| `--scada-bg-surface` | `#111b30` | Base panel/input surfaces |
| `--scada-bg-surface-elevated` | `#17233a` | Elevated cards/modals |
| `--scada-bg-accent` | `#0c7b99` | Filled primary button background |
| `--scada-border-subtle` | `#334155` | Default borders/grid lines |
| `--scada-border-strong` | `#4b6385` | Hover/strong separators |
| `--scada-text-primary` | `#e2e8f0` | Primary readable text |
| `--scada-text-secondary` | `#cbd5e1` | Secondary labels |
| `--scada-text-muted` | `#9fb0c8` | Metadata, units, timestamps |
| `--scada-accent` | `#22d3ee` | Primary interactive accent |
| `--scada-success` | `#4ade80` | Safe/healthy state |
| `--scada-warning` | `#fbbf24` | Warning/caution state |
| `--scada-danger` | `#f87171` | Critical/fault state |

## Utility classes

Defined in `frontend/index.css`.

- `text-scada-muted`: muted but readable metadata text.
- `text-scada-secondary`: secondary text color.
- `bg-scada-app`: app-level background.
- `bg-scada-surface`: shared surface background.
- `bg-scada-overlay`: shared modal/scrim overlay.
- `border-scada`: semantic subtle border color.
- `scada-input`: standardized input/select appearance and focus ring.
- `hover-bg-scada-*` and `hover-text-scada-*`: semantic hover states for interactive controls.
- `focus-ring-scada`: consistent focus ring token (`--scada-focus-ring`).
- `accent-scada`: shared accent token for range/checkbox/radio control accents.

## Chart tokens

Use these variables for chart styling instead of hard-coded hex values:

- `--scada-chart-axis`
- `--scada-chart-grid`
- `--scada-chart-legend`

Chart/runtime color constants are centralized in `frontend/theme/tokens.ts`.
Components should import chart colors from there instead of inlining hex values.

Series colors are tokenized in `theme/tokens.ts` and consumed by `Widgets.tsx`:

- Pressure/tensometer/power/servo: `--scada-series-*`
- Temperature palette: `--scada-series-temp-*`

## Component conventions

- `ScadaPanel` is the default shell for dashboard/analysis/control sections.
- Status indicators should use semantic tones (`success`, `warning`, `danger`) and avoid ad-hoc class generation.
- Form fields should use `scada-input` unless a control has a justified custom style.
- Unit labels and timestamps should use `text-scada-muted`.

## Accessibility rules

- Maintain at least 4.5:1 contrast for standard text.
- Do not use `text-slate-600` on dark surfaces.
- Inputs must keep visible focus (`scada-input` already enforces this).

## File ownership

- Global tokens and utility classes: `frontend/index.css`
- Runtime chart color constants: `frontend/theme/tokens.ts`
- Chart and panel primitives: `frontend/components/Widgets.tsx`
- App-level shell surfaces: `frontend/App.tsx`
