# Lamp Test & Camera Test — Frontend Design

**Date:** 2026-03-26
**Firmware commit:** 7a95050c09f31c8db19fb148a9e06939ddc4c48a ("Camera test and lamp test")

## Context

Two new diagnostic test modes added to firmware, both only available in `ARMED` state. Both are transient — firmware handles the full test lifecycle and automatically returns to `ARMED`.

- **LAMP_TEST** → `LAMPTEST` state: firmware activates all lights + buzzer for 2s, then returns to `ARMED`
- **CAMERA_TEST** → `CAMERATEST` state: firmware starts recording, waits 5s, stops, returns to `ARMED`

Frontend only needs to trigger the test and display the transient state — no user action required during the test.

## Changes

### `types.ts`
Add `LAMPTEST = 'LAMPTEST'` and `CAMERATEST = 'CAMERATEST'` to `SystemState` enum.

### `hooks/useMqttSystem.ts`
- Parse `'LAMPTEST'` and `'CAMERATEST'` MQTT state values
- Extend `setFireState` command type to include `'LAMP_TEST'` and `'CAMERA_TEST'`

### `utils/simulator.ts`
- `LAMP_TEST` command: if `ARMED` → `LAMPTEST`, after 2s → `ARMED`; else error
- `CAMERA_TEST` command: if `ARMED` → `CAMERATEST`, after 5s → `ARMED`; else error
- Use `setTimeout` (same pattern as `countdownTimeoutId`)

### `components/ControlPanel.tsx`
- `stateColor`: both `LAMPTEST` and `CAMERATEST` use info/blue (neutral diagnostic color)
- Bottom row becomes two rows (2×2 grid):
  ```
  [ RESET STATE ] [ SHUTDOWN    ]
  [ LAMP TEST   ] [ CAMERA TEST ]
  ```
- LAMP TEST and CAMERA TEST buttons: enabled only when `isArmed && commandsEnabled`
- Icons: `Lightbulb` for LAMP TEST, `Camera` for CAMERA TEST (lucide-react)
- Big center button: disabled FIRE during `LAMPTEST`/`CAMERATEST` (states are transient, no user action needed)
- Extend `actions.setFireState` prop type to include `'LAMP_TEST'` and `'CAMERA_TEST'`

## Out of scope
- Progress indicator during test (firmware doesn't publish progress)
- Aborting tests (firmware ignores commands during test states)
