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

  it('returns null for malformed JSON', () => {
    expect(parseChecklistPointStatePayload('{invalid json')).toBeNull();
  });

  it('returns null for missing fields', () => {
    expect(parseChecklistPointStatePayload(JSON.stringify({ completed: true }))).toBeNull();
  });
});
