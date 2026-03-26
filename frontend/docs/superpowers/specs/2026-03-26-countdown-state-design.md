# Countdown State — Frontend Design

**Date:** 2026-03-26
**Firmware commit:** fcb94d2f741cf30aa0bce8b948e373ca7272538f ("Rework sequencer")

## Context

The firmware sequencer was reworked to introduce a `COUNTDOWN` state between `ARMED` and `FIRE`. When the operator sends a `FIRE` command, the firmware enters a 10-second countdown before actually igniting. During this window the operator can issue an `ABORT` command to cancel (transitions to `POSTFIRE`). The safety switch going to safe during countdown also aborts automatically (firmware-side, no command needed).

Updated state flow:
```
ARMED → [FIRE cmd] → COUNTDOWN → [10s] → FIRE → [FIRE_END cmd] → POSTFIRE → [FIRE_RESET cmd] → ARMED
                          ↓ [ABORT cmd or safety switch goes safe]
                       POSTFIRE
```

## Changes

### `types.ts`
Add `COUNTDOWN = 'COUNTDOWN'` to `SystemState` enum between `ARMED` and `FIRE`.

### `hooks/useMqttSystem.ts`
- Parse `'COUNTDOWN'` MQTT state value → `SystemState.COUNTDOWN`
- Extend `setFireState` command type to include `'ABORT'`
- Block servo commands during `COUNTDOWN` (same as during `FIRE`)

### `utils/simulator.ts`
- `FIRE` command: transition to `COUNTDOWN`, schedule `setTimeout` of 10s → `FIRE`
- `ABORT` command: if in `COUNTDOWN` → clear timer, transition to `POSTFIRE`
- `FIRE_END` command: only accepted in `FIRE` state
- Block servo in `COUNTDOWN`

### `components/ControlPanel.tsx`
- Add `COUNTDOWN` to `stateColor` map (amber/warning color — distinct from `FIRE` red)
- Button logic per state:
  - `ARMED`: red FIRE button (unchanged)
  - `COUNTDOWN`: amber ABORT button with `AlertOctagon` icon
  - `FIRE`: amber FIRE_END/ABORT button (unchanged)
  - Other: grey disabled FIRE button
- No countdown timer displayed (frontend has no reliable end-time from MQTT)
- Extend `actions.setFireState` prop type to include `'ABORT'`

## Out of scope
- Displaying a countdown timer (firmware doesn't publish end time)
- Any changes to checklist, analysis view, or configuration
