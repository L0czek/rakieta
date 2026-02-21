# Interactive Aviation Checklist Tab Design

## Goal

Add a new checklist tab that supports aviation-style step execution for rocket experiments, including:
- strict sequential completion
- auto-validation against live telemetry/state
- MQTT-retained checklist runtime state for multi-client synchronization
- local simulation fallback when MQTT is unavailable

## Scope

In scope:
- Checklist definitions in frontend code
- Multiple checklist templates selectable in UI
- Per-step retained runtime state in MQTT
- Per-checklist reset and global reset
- Strict sequence progression
- Auto-check and manual steps
- Per-step context fields stored in point payload

Out of scope:
- MQTT-stored checklist definitions
- Arbitrary expression engine for validation
- Browser persistence for offline checklist state

## Chosen Approach

Chosen approach: `ChecklistEngine` + MQTT adapter.

Reason:
- keeps UI rendering separate from checklist rules
- supports three runtime modes without branching in components
- allows MQTT synchronization while preserving simulation-only usability

## Architecture

### 1) Definitions in code

Add checklist definitions in `config/checklists.ts` as typed static data.  
Each checklist contains ordered steps, and each step defines:
- instruction (left column text)
- expected response (right column text)
- validation type (`manual` or telemetry/state rule)
- optional context fields

### 2) Runtime engine

Add `hooks/useChecklistEngine.ts` as the canonical runtime state manager.

Responsibilities:
- derive current step from first incomplete step
- enforce strict sequence
- evaluate validation status from `SystemTelemetry`
- gate step completion
- apply per-checklist and global reset
- update local in-memory point map
- proxy writes/reads through MQTT adapter when connected
- enforce mode behavior when disconnected

### 3) MQTT transport integration

Extend `hooks/useMqttSystem.ts` to:
- subscribe to `checklist/+/points/+/state`
- parse retained payloads into checklist point state updates
- expose checklist topic publish function (retained writes)

The engine consumes inbound updates and writes outbound updates.

### 4) UI integration

Add `components/ChecklistView.tsx` and add a `CHECKLIST` tab in `App.tsx`.

Checklist UI:
- top bar checklist selector (option label shows `done/total`)
- `RESET CHECKLIST` and `RESET ALL CHECKLISTS`
- mode badge (`MQTT SYNC`, `SIM LOCAL`, `READ ONLY SNAPSHOT`)
- aviation-style two-column rows
- active-step detail and context input card
- completion button with strict gating

## Runtime Modes

### MQTT SYNC

Condition: MQTT connected.  
Behavior:
- reads from MQTT-retained updates
- writes retained point state updates to MQTT
- local map is updated from the same write path and inbound sync path

### SIM LOCAL

Condition: MQTT disconnected and simulation enabled.  
Behavior:
- checklist remains fully usable
- writes apply only to in-memory map
- state is ephemeral (lost on refresh)

### READ ONLY SNAPSHOT

Condition: MQTT disconnected and simulation disabled.  
Behavior:
- show last known in-memory snapshot
- disable completion and reset actions
- allow browsing only

## MQTT State Model

Topic per step:

`checklist/<checklistId>/points/<pointId>/state`

Retained JSON payload:

```json
{
  "completed": true,
  "completedAtWall": 1730000000000,
  "completedAtTelemetry": 124532,
  "context": {
    "experimentName": "EXP-42",
    "observedPressureBar": 45.2
  }
}
```

### Reset semantics

Per-checklist reset:
- publish retained payload for each point with `completed:false`, null timestamps, empty context

Global reset:
- apply same write across every point in every checklist definition

Result:
- previous run state is overwritten in retained topics

## Sequence and Validation Rules

Sequence:
- only first incomplete step is active/current
- completion allowed only for current step

Validation:
- auto-check steps evaluate one telemetry/state source per step
- completion allowed only when auto-check is green
- manual steps can complete without telemetry validation

## UI Status Encoding

Step rows use left/right aviation format:
- left: operator callout/instruction
- right: expected response and state symbol/color

Right column encodes status:
- green + check mark: auto-valid pass
- red + `X`: auto-valid fail
- neutral/amber + manual marker: manual step

## Error Handling

- malformed checklist payload: ignore and log warning
- unknown checklist/point topic: ignore
- out-of-order remote writes: keep raw state, show sequence warning, do not auto-delete remote data
- MQTT publish failure in sync mode: do not finalize write as confirmed until publish callback success

## Testing Strategy

Unit tests (`useChecklistEngine`):
- strict sequence derivation
- completion gating for auto/manual
- mode transitions and read-only behavior
- reset behavior (per-checklist and global)
- payload parse/validation failures

Component tests (`ChecklistView`):
- selector labels (`done/total`)
- aviation two-column row rendering
- right-side symbol/color mapping
- complete button enable/disable state

Integration smoke:
- retained state hydration on connect
- two-client synchronization
- disconnect behavior split between simulation and real mode
