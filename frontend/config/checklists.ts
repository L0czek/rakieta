import { ChecklistDefinition } from '@/types/checklist';
import { ServoState, SystemState } from '@/types';

export const CHECKLIST_DEFINITIONS: ChecklistDefinition[] = [
  {
    id: 'preflight',
    label: 'PRE-FLIGHT',
    points: [
      {
        id: 'experiment_name',
        callout: 'Name of experiment',
        response: 'RECORDED',
        note: 'Record run identifier before arming sequence.',
        rule: { type: 'manual' },
        contextFields: [
          {
            id: 'experimentName',
            label: 'Experiment Name',
            type: 'text',
            placeholder: 'EXP-001',
          },
        ],
      },
      {
        id: 'safety_switch',
        callout: 'Physical safety switch',
        response: 'SAFE',
        rule: { type: 'boolean_equals', source: 'isUnsafe', equals: false },
      },
      {
        id: 'system_state',
        callout: 'Controller state',
        response: 'ARMED',
        rule: { type: 'enum_equals', source: 'state', equals: SystemState.ARMED },
      },
    ],
  },
  {
    id: 'pressurization',
    label: 'PRESSURIZATION',
    points: [
      {
        id: 'tank_pressure',
        callout: 'Tank pressure',
        response: '40-50 BAR',
        rule: {
          type: 'number_range',
          source: 'pressureTank',
          min: 40,
          max: 50,
          unit: 'bar',
          decimals: 1,
        },
        contextFields: [
          {
            id: 'observedPressureBar',
            label: 'Observed Pressure (bar)',
            type: 'number',
            placeholder: '45.2',
          },
        ],
      },
      {
        id: 'servo_state',
        callout: 'Main valve servo',
        response: 'CLOSED',
        rule: { type: 'enum_equals', source: 'servoState', equals: ServoState.CLOSED },
      },
      {
        id: 'manual_confirm',
        callout: 'Pressurization operator note',
        response: 'CONFIRMED',
        rule: { type: 'manual' },
      },
    ],
  },
  {
    id: 'firing',
    label: 'FIRING',
    points: [
      {
        id: 'combustion_pressure',
        callout: 'Combustion pressure baseline',
        response: '0-2 BAR',
        rule: {
          type: 'number_range',
          source: 'pressureCombustion',
          min: 0,
          max: 2,
          unit: 'bar',
          decimals: 1,
        },
      },
      {
        id: 'safety_arm',
        callout: 'Physical safety switch',
        response: 'ARMED',
        rule: { type: 'boolean_equals', source: 'isUnsafe', equals: true },
      },
      {
        id: 'final_call',
        callout: 'Final call',
        response: 'GO FOR FIRE',
        rule: { type: 'manual' },
      },
    ],
  },
];

export const CHECKLIST_DEFINITION_BY_ID: Record<string, ChecklistDefinition> =
  Object.fromEntries(CHECKLIST_DEFINITIONS.map((definition) => [definition.id, definition]));
