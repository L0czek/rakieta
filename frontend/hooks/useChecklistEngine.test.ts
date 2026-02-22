import { describe, expect, it } from 'vitest';

import {
  canCompleteStep,
  deriveChecklistMode,
  getCurrentStepIndex,
} from '@/hooks/useChecklistEngine';
import { ConnectionState } from '@/types';

describe('useChecklistEngine helpers', () => {
  it('returns the first incomplete step index', () => {
    expect(getCurrentStepIndex([true, false, false])).toBe(1);
    expect(getCurrentStepIndex([true, true, true])).toBe(3);
    expect(getCurrentStepIndex([false, false])).toBe(0);
  });

  it('enforces current step and validation before completion', () => {
    expect(canCompleteStep(1, 1, true, true, false)).toBe(true);
    expect(canCompleteStep(2, 1, true, true, false)).toBe(false);
    expect(canCompleteStep(1, 1, false, true, false)).toBe(true);
    expect(canCompleteStep(1, 1, false, false, false)).toBe(true);
    expect(canCompleteStep(1, 1, true, true, true)).toBe(false);
  });

  it('derives checklist mode from connection and simulation state', () => {
    expect(deriveChecklistMode(ConnectionState.CONNECTED, false)).toBe('MQTT_SYNC');
    expect(deriveChecklistMode(ConnectionState.DISCONNECTED, true)).toBe('SIM_LOCAL');
    expect(deriveChecklistMode(ConnectionState.DISCONNECTED, false)).toBe('READ_ONLY_SNAPSHOT');
  });
});
