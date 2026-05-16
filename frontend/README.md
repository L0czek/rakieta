# Rocket Test Stand SCADA (Frontend)

Web SCADA dashboard for rocket-engine test telemetry and command/control over MQTT (WebSockets).

## What this app does

- Connects to an MQTT broker over `ws://host:port`
- Subscribes to telemetry/status topics and parses binary payloads from an ESP32-style controller
- Converts raw ADC/servo/temp values into engineering units
- Shows:
  - `Dashboard` view for live operations
  - `Analysis` view for multi-series history and timeline navigation
  - `Checklist` view for aviation-style sequential procedures
- Exports telemetry from a selected begin/end window as pandas-friendly CSV
  (`timestamp_ms,sensor_id,value`)
  Range inputs are in seconds, with a quick action to copy the currently displayed chart window.
- Persists telemetry in browser IndexedDB for history playback
- Includes an internal simulator that can:
  - Loop back directly into UI (no broker required), or
  - Publish generated packets to MQTT if connected
- Renders full telemetry series in charts while still storing raw telemetry in IndexedDB
- Synchronizes checklist runtime state between clients through retained MQTT topics
- Decodes `log/defmt` bytes in the browser using the Rust WASM decoder from the `esp32-mainboard`
  submodule and a retained firmware ELF topic

## Tech stack

- Runtime/build: `Vite` + `TypeScript` + `React`
- Charts: `uPlot` via `uplot-react`
- Icons: `lucide-react`
- MQTT client: `mqtt`
- Browser DB wrapper: `idb` (IndexedDB)
- Styling: locally compiled Tailwind CSS (Vite plugin) + SCADA design tokens in `index.css`

## Libraries used

- `react`, `react-dom`
- `uplot`, `uplot-react`
- `lucide-react`
- `mqtt`
- `idb`
- Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/node`, `vitest`,
  `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `fake-indexeddb`,
  `tailwindcss`, `@tailwindcss/vite`

## Local run

```bash
git submodule update --init --recursive
npm install
npm run dev
```

Default dev server is on `http://localhost:3000`.

Build:

```bash
npm run build
npm run preview
```

Docker Compose:

```bash
git submodule update --init --recursive
docker compose up --build frontend
```

Compose launches the frontend at `http://localhost:3000`.

Quality checks:

```bash
npm run typecheck
npm run test
```

The dev/build scripts automatically generate the browser decoder package into
`public/defmt-mqtt-decoder/` with `wasm-pack`, using
`../esp32-mainboard/tools/defmt-mqtt-decoder`.

## MQTT interface (implemented topics)

Subscribed:

- `sensor/adc/fast/#`
- `sensor/adc/slow/#`
- `sensor/digital/armed`
- `sensor/temp/#`
- `sensor/servo`
- `status/state`
- `status/servo`
- `log/defmt`
- `shared/firmware/test_stand_controller/elf` (retained raw ELF bytes)
- `cmd/state`
- `cmd/servo`
- `checklist/+/points/+/state`

Published commands:

- `cmd/state` with payloads: `FIRE`, `FIRE_END`, `FIRE_RESET`
- `cmd/servo` with payloads: `OPEN`, `CLOSE`
- `checklist/<checklistId>/points/<pointId>/state` (retained JSON):
  `{"completed":boolean,"completedAtWall":number|null,"completedAtTelemetry":number|null,"context":{...}}`

DEFMT log requirements:

- `log/defmt` payloads must be the raw encoded `defmt` byte stream
- `shared/firmware/test_stand_controller/elf` must contain the matching firmware ELF as retained
  raw bytes
- Publish the ELF with
  `../scripts/publish-test-stand-elf.sh <path-to-test_stand_controller-elf>`

## Operator UX/design

- Dark SCADA look: cyan highlights, panel borders, monospace typography, CRT overlay lines
- Design tokens and UI conventions are documented in `docs/design-system.md`
- Safety-first interactions:
  - Fire allowed only when system is ARMED and physical safety is unsafe/armed
  - Servo commands blocked during FIRE
  - Critical time-travel check can force disconnect and display lockout modal
- Live packet clock shown as `T+timestamp`
- Config modal for broker host/port
- Checklist modes:
  - `MQTT SYNC`: connected, synchronized and retained
  - `SIM LOCAL`: disconnected + simulation, local-only ephemeral state
  - `READ ONLY SNAPSHOT`: disconnected + real mode, browsing only

## Notes

- Data is retained in browser IndexedDB database `rocket_telemetry_db` until reset.
- IndexedDB storage is chunked by sensor and time window (`1000ms` chunks) rather than
  one-record-per-point, which reduces write amplification under high-rate telemetry.
- Major views and MQTT transport runtime are lazy-loaded to reduce cold-start JS payload.
- `Reset` in critical modal clears IndexedDB and in-memory telemetry.
- `Status log` now renders decoded `defmt` lines plus decoder/runtime warnings instead of
  `status/cmd`.
- `vite.config.ts` exposes `GEMINI_API_KEY` defines, but this frontend currently does not use Gemini APIs.
