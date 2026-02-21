# Rocket Test Stand SCADA (Frontend)

Web SCADA dashboard for rocket-engine test telemetry and command/control over MQTT (WebSockets).

## What this app does

- Connects to an MQTT broker over `ws://host:port`
- Subscribes to telemetry/status topics and parses binary payloads from an ESP32-style controller
- Converts raw ADC/servo/temp values into engineering units
- Shows:
  - `Dashboard` view for live operations
  - `Analysis` view for multi-series history and timeline navigation
- Persists telemetry in browser IndexedDB for history playback
- Includes an internal simulator that can:
  - Loop back directly into UI (no broker required), or
  - Publish generated packets to MQTT if connected
- Caps rendering to `1000` points per plotted line using min-max downsampling
  (peak-preserving), while still storing raw telemetry in IndexedDB

## Tech stack

- Runtime/build: `Vite` + `TypeScript` + `React`
- Charts: `recharts`
- Icons: `lucide-react`
- MQTT client: `mqtt`
- Browser DB wrapper: `idb` (IndexedDB)
- Styling: Tailwind utility classes via CDN script in `index.html`

## Libraries used

- `react`, `react-dom`
- `recharts`
- `lucide-react`
- `mqtt`
- `idb`
- Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/node`

## Local run

```bash
npm install
npm run dev
```

Default dev server is on `http://localhost:3000`.

Build:

```bash
npm run build
npm run preview
```

## MQTT interface (implemented topics)

Subscribed:

- `sensor/adc/fast/#`
- `sensor/adc/slow/#`
- `sensor/digital/armed`
- `sensor/temp/#`
- `sensor/servo`
- `status/#`
- `cmd/state`
- `cmd/servo`

Published commands:

- `cmd/state` with payloads: `FIRE`, `FIRE_END`, `FIRE_RESET`
- `cmd/servo` with payloads: `OPEN`, `CLOSE`

## Operator UX/design

- Dark SCADA look: cyan highlights, panel borders, monospace typography, CRT overlay lines
- Safety-first interactions:
  - Fire allowed only when system is ARMED and physical safety is unsafe/armed
  - Servo commands blocked during FIRE
  - Critical time-travel check can force disconnect and display lockout modal
- Live packet clock shown as `T+timestamp`
- Config modal for broker host/port

## Notes

- Data is retained in browser IndexedDB database `rocket_telemetry_db` until reset.
- IndexedDB storage is chunked by sensor and time window (`1000ms` chunks) rather than
  one-record-per-point, which reduces write amplification under high-rate telemetry.
- `Reset` in critical modal clears IndexedDB and in-memory telemetry.
- `vite.config.ts` exposes `GEMINI_API_KEY` defines, but this frontend currently does not use Gemini APIs.

## Performance probes

Enable probes in browser console:

```js
localStorage.setItem('scada.probe', '1');
location.reload();
```

Disable probes:

```js
localStorage.setItem('scada.probe', '0');
location.reload();
```

Probes print aggregated tables every 2s under `[SCADA probe]` in DevTools console.
