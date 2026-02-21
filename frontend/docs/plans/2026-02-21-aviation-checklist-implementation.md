# Aviation Checklist Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an interactive aviation-style checklist tab with strict sequential progression, telemetry-backed validation, retained MQTT synchronization, and simulation/local fallback behavior.

**Architecture:** Keep checklist definitions static in frontend code (`config/checklists.ts`). Route all checklist state transitions through `useChecklistEngine`, with MQTT transport provided by `useMqttSystem`. The UI (`ChecklistView`) remains a rendering/controller layer over engine state.

**Tech Stack:** React 19, TypeScript, Vite, MQTT.js, Vitest, Testing Library

---

Execution skills to use while implementing: `@superpowers:test-driven-development`, `@superpowers:verification-before-completion`.

### Task 1: Add test harness for checklist work

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/smoke.test.ts`

**Step 1: Write the failing test**

```ts
// tests/smoke.test.ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs vitest', () => {
    expect(true).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke.test.ts`  
Expected: FAIL because `test` script is missing.

**Step 3: Write minimal implementation**

```json
// package.json (scripts)
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json vitest.config.ts tests/setup.ts tests/smoke.test.ts
git commit -m "test: add vitest harness for checklist feature"
```

### Task 2: Add checklist domain types, definitions, and topic helpers

**Files:**
- Create: `types/checklist.ts`
- Create: `config/checklists.ts`
- Create: `utils/checklistTopics.ts`
- Create: `utils/checklistTopics.test.ts`

**Step 1: Write the failing test**

```ts
// utils/checklistTopics.test.ts
import { describe, expect, it } from 'vitest';
import { buildChecklistPointTopic, parseChecklistPointTopic } from '@/utils/checklistTopics';

describe('checklist topic helpers', () => {
  it('builds and parses point topic', () => {
    const topic = buildChecklistPointTopic('preflight', 'tank_pressure');
    expect(topic).toBe('checklist/preflight/points/tank_pressure/state');
    expect(parseChecklistPointTopic(topic)).toEqual({
      checklistId: 'preflight',
      pointId: 'tank_pressure',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- utils/checklistTopics.test.ts`  
Expected: FAIL because module does not exist.

**Step 3: Write minimal implementation**

```ts
// utils/checklistTopics.ts
const TOPIC_PREFIX = 'checklist';

export const buildChecklistPointTopic = (checklistId: string, pointId: string): string =>
  `${TOPIC_PREFIX}/${checklistId}/points/${pointId}/state`;

export const parseChecklistPointTopic = (
  topic: string,
): { checklistId: string; pointId: string } | null => {
  const parts = topic.split('/');
  if (parts.length !== 5) return null;
  if (parts[0] !== TOPIC_PREFIX || parts[2] !== 'points' || parts[4] !== 'state') return null;
  return { checklistId: parts[1], pointId: parts[3] };
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- utils/checklistTopics.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add types/checklist.ts config/checklists.ts utils/checklistTopics.ts utils/checklistTopics.test.ts
git commit -m "feat: add checklist definitions and topic helpers"
```

### Task 3: Extend MQTT system with checklist retained state transport

**Files:**
- Modify: `hooks/useMqttSystem.ts`
- Modify: `types.ts`
- Create: `hooks/useMqttChecklistTransport.test.ts`

**Step 1: Write the failing test**

```ts
// hooks/useMqttChecklistTransport.test.ts (focused unit on handlers)
import { describe, expect, it } from 'vitest';

describe('checklist MQTT transport', () => {
  it('ignores malformed checklist payloads', () => {
    // Arrange handler with bad JSON
    // Assert no crash and no state update
    expect(true).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- hooks/useMqttChecklistTransport.test.ts`  
Expected: FAIL after replacing placeholder with real import/handler that is not implemented.

**Step 3: Write minimal implementation**

Implement in `useMqttSystem`:
- subscribe to `checklist/+/points/+/state` on connect
- parse incoming JSON for checklist point payload shape
- expose:
  - `checklistPointStates` map keyed by `checklistId/pointId`
  - `publishChecklistPointState(checklistId, pointId, payload)` retained write
  - `resetChecklistPoints(list)` helper used by engine

Minimal type additions:

```ts
export interface ChecklistPointRuntimeState {
  completed: boolean;
  completedAtWall: number | null;
  completedAtTelemetry: number | null;
  context: Record<string, string | number | boolean | null>;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- hooks/useMqttChecklistTransport.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add hooks/useMqttSystem.ts types.ts hooks/useMqttChecklistTransport.test.ts
git commit -m "feat: add checklist mqtt transport with retained state"
```

### Task 4: Implement checklist engine core logic with strict sequencing

**Files:**
- Create: `hooks/useChecklistEngine.ts`
- Create: `hooks/useChecklistEngine.test.ts`
- Modify: `config/checklists.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { getCurrentStepIndex, canCompleteStep } from '@/hooks/useChecklistEngine';

describe('useChecklistEngine core', () => {
  it('only allows completion on first incomplete step', () => {
    const completed = [true, false, false];
    expect(getCurrentStepIndex(completed)).toBe(1);
    expect(canCompleteStep(2, 1, true, false)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- hooks/useChecklistEngine.test.ts`  
Expected: FAIL because helpers/hook are missing.

**Step 3: Write minimal implementation**

Include engine behavior:
- mode derivation:
  - MQTT connected -> `MQTT_SYNC`
  - disconnected + sim -> `SIM_LOCAL`
  - disconnected + real -> `READ_ONLY`
- compute per-checklist completion `(done/total)`
- complete step:
  - validate current index
  - require green for auto step
  - allow manual step
  - stamp both timestamps:

```ts
const payload = {
  completed: true,
  completedAtWall: Date.now(),
  completedAtTelemetry: telemetry.lastPacketTimestamp,
  context,
};
```

- reset checklist/global:
  - in MQTT mode -> retained writes for each point
  - in sim local -> local map reset
  - in read-only -> no-op with explicit error

**Step 4: Run test to verify it passes**

Run: `npm run test -- hooks/useChecklistEngine.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add hooks/useChecklistEngine.ts hooks/useChecklistEngine.test.ts config/checklists.ts
git commit -m "feat: implement checklist engine with strict sequence rules"
```

### Task 5: Build aviation-style checklist UI component

**Files:**
- Create: `components/ChecklistView.tsx`
- Create: `components/ChecklistView.test.tsx`
- Modify: `components/Widgets.tsx` (only if shared panel primitives are needed)

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChecklistView } from '@/components/ChecklistView';

describe('ChecklistView', () => {
  it('renders two-column aviation row', () => {
    render(<ChecklistView {...mockProps} />);
    expect(screen.getByText('TANK PRESSURE')).toBeInTheDocument();
    expect(screen.getByText('40-50 BAR')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- components/ChecklistView.test.tsx`  
Expected: FAIL because component is missing.

**Step 3: Write minimal implementation**

ChecklistView requirements:
- top selector options: `NAME (done/total)`
- buttons: `RESET CHECKLIST`, `RESET ALL CHECKLISTS`
- mode badge rendering
- row layout:
  - left instruction text
  - right expected response with status encoding:
    - green + check
    - red + `X`
    - amber + manual marker
- active-step detail card + context inputs
- complete button disabled by engine flags

**Step 4: Run test to verify it passes**

Run: `npm run test -- components/ChecklistView.test.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/ChecklistView.tsx components/ChecklistView.test.tsx components/Widgets.tsx
git commit -m "feat: add aviation-style checklist tab component"
```

### Task 6: Integrate checklist tab into app shell

**Files:**
- Modify: `App.tsx`
- Modify: `hooks/useMqttSystem.ts`
- Modify: `types.ts`

**Step 1: Write the failing integration test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '@/App';

describe('App checklist integration', () => {
  it('shows checklist tab toggle', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /CHECKLIST/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- App.checklist.test.tsx`  
Expected: FAIL because tab does not exist.

**Step 3: Write minimal implementation**

- add `CHECKLIST` to app view union
- add nav button and render `ChecklistView` when selected
- wire `useChecklistEngine` with:
  - telemetry
  - simulation state
  - MQTT connection state
  - MQTT checklist transport methods

**Step 4: Run test to verify it passes**

Run: `npm run test -- App.checklist.test.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add App.tsx hooks/useMqttSystem.ts types.ts App.checklist.test.tsx
git commit -m "feat: integrate checklist engine and view into app tabs"
```

### Task 7: Documentation updates and final verification

**Files:**
- Modify: `README.md`
- Modify: `DEV.md`

**Step 1: Write doc checks as failing criteria**

Verify docs do not mention checklist yet:

Run: `rg -n "checklist|CHECKLIST" README.md DEV.md`  
Expected: no relevant checklist section (or incomplete info).

**Step 2: Write minimal implementation**

Update `README.md`:
- add checklist tab capability summary
- add MQTT checklist topic schema and mode behavior

Update `DEV.md`:
- add checklist architecture and new files
- describe runtime modes and sequence gating

**Step 3: Run verification commands**

Run:
- `npm run typecheck`
- `npm run test`
- `npm run build`

Expected: all PASS.

**Step 4: Commit**

```bash
git add README.md DEV.md
git commit -m "docs: add checklist architecture and usage details"
```

### Task 8: Final validation in two-instance sync scenario

**Files:**
- No code changes expected (validation task)

**Step 1: Run manual sync validation**

1. Start app in two browser windows.
2. Connect both to same MQTT broker.
3. Complete current step in window A.
4. Confirm window B updates same step state and current-step index.

**Step 2: Run disconnect mode validation**

1. Disconnect MQTT while simulation on -> confirm `SIM LOCAL` and completion enabled.
2. Disconnect MQTT while simulation off -> confirm `READ ONLY SNAPSHOT` and completion disabled.

**Step 3: Record verification notes**

Capture short verification notes in PR description or commit message body.

