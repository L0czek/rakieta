# DEV Notes: Rocket Test Stand SCADA Frontend

## Implementation summary

This is a single-page React+TypeScript application built on Vite. The architecture is local-first:

1. Receive telemetry/status from MQTT (or simulator loopback)
2. Parse binary packets into typed values
3. Convert raw values to engineering units
4. Update live in-memory telemetry state for UI refresh (~30 FPS)
5. Batch-write historical points to IndexedDB every 500 ms
6. Read IndexedDB ranges on demand in Analysis mode
7. Persist telemetry in 1000ms sensor chunks in IndexedDB to reduce write overhead
8. Manage checklist execution state with strict sequencing and retained MQTT sync

## Project structure

- `index.tsx`
  - App bootstrap and React root mount.
- `App.tsx`
  - Top-level shell, header, view switch (`DASHBOARD`/`ANALYSIS`/`CHECKLIST`/`CONFIGURATION`),
    config modal, critical error modal.
  - Owns broker host/port UI state.
- `types.ts`
  - Core enums/interfaces for telemetry and command state.
- `types/checklist.ts`
  - Checklist domain types: definitions, runtime point state, rule variants, mode labels.
- `config/checklists.ts`
  - Static checklist templates and ordered point definitions.
- `hooks/useMqttSystem.ts`
  - Main runtime orchestration:
    - MQTT lifecycle (`connect`, subscriptions, publish)
    - Simulator lifecycle
    - Message decoding dispatch per topic
    - Checklist retained topic parse/publish helpers
    - Safety/time checks
    - DB write buffer + periodic flush
    - Action API exposed to UI panels
- `hooks/useChecklistEngine.ts`
  - Checklist runtime logic:
    - mode derivation (`MQTT_SYNC` / `SIM_LOCAL` / `READ_ONLY_SNAPSHOT`)
    - strict sequential gating and step completion checks
    - telemetry/state rule evaluation
    - per-checklist and global reset actions
- `components/DashboardView.tsx`
  - Live operations layout with 5-second fast-signal charts and control cards.
- `components/AnalysisView.tsx`
  - Multi-axis charting and historical navigation.
  - Toggleable series and debounced DB range fetch queue.
- `components/ChecklistView.tsx`
  - Aviation-style two-column checklist UI.
  - Checklist selector with progress labels, active step panel, context inputs, completion actions.
- `components/ControlPanel.tsx`
  - State display + FIRE/ABORT/RESET actions with gating logic.
- `components/ServoPanel.tsx`
  - Servo position/status and open/close controls.
- `components/Widgets.tsx`
  - Shared panel/charts/value widgets and color constants.
- `utils/parser.ts`
  - Binary packet parsing (LE u32/u16, packed 12-bit ADC, signed 14-bit temp).
- `utils/packetBuilder.ts`
  - Simulator packet generation matching parser format.
- `utils/conversions.ts`
  - ADC correction LUT and physical conversions (pressure, thrust, voltages, temp, servo %).
- `utils/checklistTopics.ts`
  - Checklist MQTT topic build/parse helpers.
- `utils/simulator.ts`
  - Deterministic-ish telemetry generator + command handling state machine.
- `utils/db.ts`
  - IndexedDB storage adapter with chunked time-series rows (`measurements`, `meta` stores).
- `index.html`
  - Tailwind CDN injection + global SCADA CSS effects.
- `vite.config.ts`
  - Host/port dev-server config, alias `@`, env define passthrough.

## Runtime design

### [1] State model

- Live state in `telemetryRef` (`SystemTelemetry`) to avoid high-frequency React churn.
- React state mirror updated every 33 ms (`setInterval`) for rendering.
- In-memory history ring-like slicing for fast UI (`MAX_LIVE_POINTS = 2500`).

### [2] Data ingress

- MQTT `message` callback dispatches by topic.
- Parser outputs normalized packet objects.
- Conversion functions map raw payloads to physical values.
- `checkTime` guards against severe timestamp rollback (`>1000`) and triggers critical lockout.

### [3] Persistence

- Buffered writes by sensor key in memory.
- Active sensor chunks are sealed at `MAX_CHUNK_DURATION_MS = 1000` or inactivity timeout.
- Flush timer every 500 ms bulk writes sealed chunks to IndexedDB.
- `meta.lastTimestamp` and earliest chunk start timestamp are used for timeline bounds.

### [4] Analysis mode retrieval

- In paused/history mode, visible line keys are fetched from IndexedDB by `[sensorId, timestamp]` range.
- Debounced queue avoids overloading IndexedDB during rapid scrolling/zooming.

### [5] Simulator integration

- If MQTT is connected: simulator publishes generated packets to broker.
- If MQTT is disconnected: simulator packets are looped directly into message handler.
- Simulator enforces command logic:
  - FIRE requires `ARMED` + unsafe/armed safety state
  - Servo commands denied during FIRE

### [6] Checklist runtime

- Definitions are frontend-only (`config/checklists.ts`), with manual and auto-validated points.
- Runtime point state uses per-point retained topics:
  - `checklist/<checklistId>/points/<pointId>/state`
- `useChecklistEngine` computes current step as first incomplete point.
- Completion is blocked unless:
  - point is current step
  - mode is not read-only
  - auto-check point is green (manual points can always complete)
- Disconnected behavior:
  - simulation on: `SIM_LOCAL` (fully usable, local ephemeral)
  - simulation off: `READ_ONLY_SNAPSHOT` (browse only, no writes)

## Packet formats implemented

- Fast ADC: `u32 tStart` + `u32 tEnd` + packed 12-bit samples (2 samples / 3 bytes, optional trailing handling)
- Slow ADC: `u32 timestamp` + `u16 value`
- Digital: `u32 timestamp` + `u8 value`
- Temp: `u32 timestamp` + repeated signed 14-bit values in 16-bit containers
- Servo: `u32 timestamp` + `u16 value`

## UI design and features

- Visual direction: industrial SCADA/HMI style
- Typography: monospace dominant
- Color system: slate background + cyan primary accents, red danger states
- Panels: bordered cards with corner accents and neon-like glow
- Motion:
  - Pulsing alerts for dangerous states
  - Critical failure modal emphasis
- Major features:
  - Connection config modal
  - Live dashboard charts and thermal tiles
  - Advanced analysis chart with axis-per-metric toggles
  - Timeline scroll + zoom + live/pause mode
  - Fire control panel and servo diagnostics/control
  - Simulation safety override toggle
  - Checklist tab with strict sequential aviation-style execution

## Known implementation constraints

- No auth/TLS support in UI config (only ws host/port exposed directly in modal).
- Dynamic Tailwind class construction in `DigitalIndicator` may not be robust outside CDN/JIT behavior.
- Dependency versions in `package.json` use ranges (`^`, `~`) rather than exact pins.

## Suggested next technical steps

1. Add lint script/tooling and enforce it in CI alongside `typecheck` and `test`.
2. Add `index.css` or remove stale reference.
3. Expand checklist test coverage to include multi-client MQTT sync integration tests.
4. Expand broker config with protocol/TLS/credentials UX where needed.

## Debug instrumentation

- `utils/perfProbe.ts` provides opt-in, aggregated performance probes.
- Enable with `localStorage.setItem('scada.probe', '1')` and page reload.
- Probes currently instrument:
  - telemetry ingress and DB flush timing,
  - App/Analysis/FastChart render and commit frequency.
