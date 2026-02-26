import { describe, expect, it } from 'vitest';

import {
  buildChecklistPointTopic,
  parseChecklistPointTopic,
} from '@/utils/checklistTopics';

describe('checklist topic helpers', () => {
  it('builds and parses checklist point topic', () => {
    const topic = buildChecklistPointTopic('preflight', 'tank_pressure');
    expect(topic).toBe('checklist/preflight/points/tank_pressure/state');
    expect(parseChecklistPointTopic(topic)).toEqual({
      checklistId: 'preflight',
      pointId: 'tank_pressure',
    });
  });

  it('rejects non-checklist topics', () => {
    expect(parseChecklistPointTopic('status/state')).toBeNull();
    expect(parseChecklistPointTopic('checklist/preflight/state')).toBeNull();
  });
});
