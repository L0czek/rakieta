import { describe, expect, it } from 'vitest';

import { CHECKLIST_DEFINITIONS, REQUIRED_THERMOMETER_COUNT } from '@/config/checklists';

const fieldIds = (checklistId: string): string[] =>
  (CHECKLIST_DEFINITIONS.find((definition) => definition.id === checklistId)?.points ?? []).flatMap(
    (point) => (point.contextFields ?? []).map((field) => field.id),
  );

describe('checklist definitions', () => {
  it('holds the eight hot fire lists in order', () => {
    expect(CHECKLIST_DEFINITIONS.map((definition) => [definition.id, definition.points.length])).toEqual([
      ['ground_station', 3],
      ['assembly', 18],
      ['stand_setup', 20],
      ['engine_setup', 8],
      ['fire', 19],
      ['postfire', 9],
      ['aborted', 12],
      ['secure_data', 9],
    ]);
  });

  it('gives every step an id that is unique within its list and usable in a topic', () => {
    for (const definition of CHECKLIST_DEFINITIONS) {
      const ids = definition.points.map((point) => point.id);
      expect(new Set(ids).size, definition.id).toBe(ids.length);
      for (const id of [definition.id, ...ids]) {
        expect(id).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it('does not display notes', () => {
    for (const definition of CHECKLIST_DEFINITIONS) {
      for (const point of definition.points) {
        expect(point.note, `${definition.id}/${point.id}`).toBeUndefined();
      }
    }
  });

  it('has typed-in fields only on the steps that record a value', () => {
    expect(fieldIds('stand_setup')).toEqual(['tensometerReading', 'referenceWeightReading']);
    expect(fieldIds('fire')).toEqual(['experimentName', 'controllerTime', 'bottleFinalWeight']);
    for (const id of ['ground_station', 'assembly', 'engine_setup', 'postfire', 'aborted', 'secure_data']) {
      expect(fieldIds(id), id).toEqual([]);
    }
  });

  it('uses one thermometer count for every thermometer step', () => {
    const rules = CHECKLIST_DEFINITIONS.flatMap((definition) => definition.points)
      .map((point) => point.rule)
      .filter((rule) => rule.type === 'thermometers');
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule.type === 'thermometers' && rule.minCount).toBe(REQUIRED_THERMOMETER_COUNT);
    }
  });
});
