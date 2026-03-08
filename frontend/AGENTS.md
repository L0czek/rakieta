# Frontend Agent Notes

## Scope

This file documents the `frontend/` app for coding agents.

## Architecture map

- `App.tsx`: top-level shell, view switching, connection modal, critical lockout overlay.
- `hooks/useMqttSystem.ts`: telemetry/control runtime, MQTT transport, simulator integration, persistence orchestration.
- `hooks/useChecklistEngine.ts`: sequential checklist runtime and mode handling.
- `components/`
  - `DashboardView.tsx`: live operations dashboard.
  - `AnalysisView.tsx`: historical analysis timeline and series toggles.
  - `ChecklistView.tsx`: checklist UI and inline step actions.
  - `ConfigurationView.tsx`: conversion + LUT calibration editor.
  - `Widgets.tsx`: shared SCADA panel/chart/value primitives.
- `utils/`: parser, conversions, DB, simulator, checklist topic helpers.

## Styling and design system

- Global tokens and utility classes live in `index.css`.
- Design system reference: `docs/design-system.md`.
- Prefer semantic classes and CSS variables:
  - `scada-input`
  - `text-scada-muted`
  - `--scada-*` tokens
- Avoid introducing hard-coded one-off colors in components.

## Current constraints

- Styling still uses Tailwind via CDN script in `index.html`.
- Bundle is currently monolithic (analysis/chart runtime eagerly loaded).
