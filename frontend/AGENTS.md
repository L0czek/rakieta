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
- `utils/defmt.ts`: DEFMT MQTT topic constants, wasm loader, and byte helpers.
- `utils/statusLog.ts`: bounded status-log append helpers shared by the MQTT runtime.
- `scripts/build-defmt-decoder.sh`: builds the browser DEFMT decoder package from the
  `esp32-mainboard` submodule into `public/defmt-mqtt-decoder/`.

## Styling and design system

- Global tokens and utility classes live in `index.css`.
- Shared runtime color constants live in `theme/tokens.ts`.
- Design system reference: `docs/design-system.md`.
- Prefer semantic classes and CSS variables:
  - `scada-input`
  - `text-scada-muted`
  - `--scada-*` tokens
- Avoid introducing hard-coded one-off colors in components.

## Current constraints

- Tailwind is compiled locally through Vite (`@tailwindcss/vite`) from `index.css`.
- Views are lazy-loaded from `App.tsx` to reduce initial payload.
- MQTT runtime is loaded on demand in `useMqttSystem.connect()` (dynamic import).
- DEFMT decoding depends on a retained raw ELF payload on
  `shared/firmware/test_stand_controller/elf` and the wasm package built from
  `../esp32-mainboard/tools/defmt-mqtt-decoder`.
