import { describe, expect, it } from 'vitest';

import { parseChecklistPointStatePayload } from '@/hooks/useMqttSystem';

describe('checklist MQTT payload parsing', () => {
  it('parses a valid retained payload', () => {
    const payload = JSON.stringify({
      completed: true,
      completedAtWall: 1000,
      completedAtTelemetry: 2000,
      context: { experimentName: 'EXP-1', observedPressureBar: 43.2 },
    });

    expect(parseChecklistPointStatePayload(payload)).toEqual({
      completed: true,
      completedAtWall: 1000,
      completedAtTelemetry: 2000,
      context: { experimentName: 'EXP-1', observedPressureBar: 43.2 },
    });
  });

  it('parses an overridden step', () => {
    const state = {
      completed: true,
      completedAtWall: 1000,
      completedAtTelemetry: 2000,
      context: {},
      overridden: true,
      overrideReason: 'sensor miscalibrated',
    };

    expect(parseChecklistPointStatePayload(JSON.stringify(state))).toEqual(state);
  });

  it('reads a payload without override fields as not overridden', () => {
    const parsed = parseChecklistPointStatePayload(
      JSON.stringify({ completed: true, completedAtWall: 1, completedAtTelemetry: 2, context: {} }),
    );

    expect(parsed?.overridden).toBeUndefined();
    expect(parsed?.overrideReason).toBeUndefined();
  });

  it('returns null for override fields of the wrong type', () => {
    const base = { completed: true, completedAtWall: 1, completedAtTelemetry: 2, context: {} };

    expect(parseChecklistPointStatePayload(JSON.stringify({ ...base, overridden: 'yes' }))).toBeNull();
    expect(parseChecklistPointStatePayload(JSON.stringify({ ...base, overridden: true, overrideReason: 5 }))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseChecklistPointStatePayload('{invalid json')).toBeNull();
  });

  it('returns null for missing fields', () => {
    expect(parseChecklistPointStatePayload(JSON.stringify({ completed: true }))).toBeNull();
  });
});
