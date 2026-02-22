import { ServoState, SystemState } from '@/types';

export type ChecklistContextValue = string | number | boolean | null;

export interface ChecklistPointRuntimeState {
  completed: boolean;
  completedAtWall: number | null;
  completedAtTelemetry: number | null;
  context: Record<string, ChecklistContextValue>;
}

export interface ChecklistTopicUpdate {
  checklistId: string;
  pointId: string;
  state: ChecklistPointRuntimeState;
}

export interface ChecklistContextField {
  id: string;
  label: string;
  type: 'text' | 'number';
  placeholder?: string;
}

type SeriesTelemetryKey = 'pressureTank' | 'pressureCombustion' | 'tensometer';
type ScalarTelemetryKey =
  | 'batteryStand'
  | 'batteryComputer'
  | 'boostVoltage'
  | 'starterSense'
  | 'servoPosition';
type BooleanTelemetryKey = 'isUnsafe';
type EnumTelemetryKey = 'state' | 'servoState';

export type ChecklistRule =
  | { type: 'manual' }
  | {
      type: 'number_range';
      source: SeriesTelemetryKey | ScalarTelemetryKey;
      min: number;
      max: number;
      unit?: string;
      decimals?: number;
    }
  | {
      type: 'boolean_equals';
      source: BooleanTelemetryKey;
      equals: boolean;
    }
  | {
      type: 'enum_equals';
      source: EnumTelemetryKey;
      equals: SystemState | ServoState;
    };

export interface ChecklistPointDefinition {
  id: string;
  callout: string;
  response: string;
  note?: string;
  rule: ChecklistRule;
  contextFields?: ChecklistContextField[];
}

export interface ChecklistDefinition {
  id: string;
  label: string;
  points: ChecklistPointDefinition[];
}

export type ChecklistMode = 'MQTT_SYNC' | 'SIM_LOCAL' | 'READ_ONLY_SNAPSHOT';

export interface ChecklistValidationResult {
  isAutoRule: boolean;
  isValid: boolean;
  displayValue: string;
}
