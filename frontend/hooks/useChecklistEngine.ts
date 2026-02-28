import { useCallback, useMemo, useState } from 'react';

import { CHECKLIST_DEFINITIONS } from '@/config/checklists';
import { ConnectionState, SystemTelemetry } from '@/types';
import {
  ChecklistDefinition,
  ChecklistMode,
  ChecklistPointDefinition,
  ChecklistPointRuntimeState,
  ChecklistValidationResult,
  ChecklistContextValue,
} from '@/types/checklist';

const EMPTY_POINT_STATE: ChecklistPointRuntimeState = {
  completed: false,
  completedAtWall: null,
  completedAtTelemetry: null,
  context: {},
};

const getPointMapKey = (checklistId: string, pointId: string): string => `${checklistId}/${pointId}`;

const getNumericSourceValue = (source: string, telemetry: SystemTelemetry): number | null => {
  const value = telemetry[source as keyof SystemTelemetry];
  if (typeof value === 'number') return value;
  if (!Array.isArray(value) || value.length === 0) return null;

  const last = value[value.length - 1] as { value?: unknown };
  return typeof last.value === 'number' ? last.value : null;
};

const formatNumeric = (value: number | null, decimals: number = 2): string => {
  if (value === null || Number.isNaN(value)) return '--';
  return value.toFixed(decimals);
};

export const deriveChecklistMode = (
  connectionStatus: ConnectionState,
  isSimulating: boolean,
): ChecklistMode => {
  if (connectionStatus === ConnectionState.CONNECTED) return 'MQTT_SYNC';
  if (isSimulating) return 'SIM_LOCAL';
  return 'READ_ONLY_SNAPSHOT';
};

export const getCurrentStepIndex = (completionStates: boolean[]): number => {
  return completionStates.findIndex((completed) => !completed) === -1
    ? completionStates.length
    : completionStates.findIndex((completed) => !completed);
};

export const canCompleteStep = (
  stepIndex: number,
  currentStepIndex: number,
  isAutoRule: boolean,
  isValid: boolean,
  isReadOnly: boolean,
): boolean => {
  if (isReadOnly) return false;
  if (stepIndex !== currentStepIndex) return false;
  if (!isAutoRule) return true;
  return isValid;
};

export const evaluateChecklistPoint = (
  point: ChecklistPointDefinition,
  telemetry: SystemTelemetry,
): ChecklistValidationResult => {
  if (point.rule.type === 'manual') {
    return { isAutoRule: false, isValid: true, displayValue: 'MANUAL' };
  }

  if (point.rule.type === 'number_range') {
    const numericValue = getNumericSourceValue(point.rule.source, telemetry);
    if (numericValue === null) {
      return { isAutoRule: true, isValid: false, displayValue: '--' };
    }

    return {
      isAutoRule: true,
      isValid: numericValue >= point.rule.min && numericValue <= point.rule.max,
      displayValue: formatNumeric(numericValue, point.rule.decimals),
    };
  }

  if (point.rule.type === 'boolean_equals') {
    const value = telemetry[point.rule.source];
    if (typeof value !== 'boolean') {
      return { isAutoRule: true, isValid: false, displayValue: '--' };
    }

    return {
      isAutoRule: true,
      isValid: value === point.rule.equals,
      displayValue: value ? 'TRUE' : 'FALSE',
    };
  }

  const enumValue = telemetry[point.rule.source];
  if (typeof enumValue !== 'string') {
    return { isAutoRule: true, isValid: false, displayValue: '--' };
  }

  return {
    isAutoRule: true,
    isValid: enumValue === point.rule.equals,
    displayValue: enumValue,
  };
};

export interface ChecklistSummary {
  checklistId: string;
  label: string;
  done: number;
  total: number;
}

export interface ChecklistStepState {
  index: number;
  point: ChecklistPointDefinition;
  runtimeState: ChecklistPointRuntimeState;
  validation: ChecklistValidationResult;
  isCurrent: boolean;
  isCompleted: boolean;
  isLocked: boolean;
}

interface UseChecklistEngineOptions {
  telemetry: SystemTelemetry;
  connectionStatus: ConnectionState;
  isSimulating: boolean;
  pointStates: Record<string, ChecklistPointRuntimeState>;
  publishChecklistPointState: (
    checklistId: string,
    pointId: string,
    state: ChecklistPointRuntimeState,
  ) => Promise<void>;
  definitions?: ChecklistDefinition[];
}

export const useChecklistEngine = ({
  telemetry,
  connectionStatus,
  isSimulating,
  pointStates,
  publishChecklistPointState,
  definitions = CHECKLIST_DEFINITIONS,
}: UseChecklistEngineOptions) => {
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>(definitions[0]?.id ?? '');
  const [contextDrafts, setContextDrafts] = useState<Record<string, Record<string, ChecklistContextValue>>>(
    {},
  );

  const mode = deriveChecklistMode(connectionStatus, isSimulating);
  const isReadOnly = mode === 'READ_ONLY_SNAPSHOT';

  const getRuntimePointState = useCallback(
    (checklistId: string, pointId: string): ChecklistPointRuntimeState => {
      return pointStates[getPointMapKey(checklistId, pointId)] ?? EMPTY_POINT_STATE;
    },
    [pointStates],
  );

  const summaries = useMemo<ChecklistSummary[]>(() => {
    return definitions.map((definition) => {
      const done = definition.points.filter((point) =>
        getRuntimePointState(definition.id, point.id).completed,
      ).length;
      return {
        checklistId: definition.id,
        label: definition.label,
        done,
        total: definition.points.length,
      };
    });
  }, [definitions, getRuntimePointState]);

  const selectedChecklist = useMemo(() => {
    return definitions.find((definition) => definition.id === selectedChecklistId) ?? definitions[0] ?? null;
  }, [definitions, selectedChecklistId]);

  const currentStepIndex = useMemo(() => {
    if (!selectedChecklist) return 0;
    const completed = selectedChecklist.points.map((point) =>
      getRuntimePointState(selectedChecklist.id, point.id).completed,
    );
    return getCurrentStepIndex(completed);
  }, [selectedChecklist, getRuntimePointState]);

  const stepStates = useMemo<ChecklistStepState[]>(() => {
    if (!selectedChecklist) return [];
    return selectedChecklist.points.map((point, index) => {
      const runtimeState = getRuntimePointState(selectedChecklist.id, point.id);
      const validation = evaluateChecklistPoint(point, telemetry);
      return {
        index,
        point,
        runtimeState,
        validation,
        isCurrent: index === currentStepIndex,
        isCompleted: runtimeState.completed,
        isLocked: index > currentStepIndex,
      };
    });
  }, [selectedChecklist, getRuntimePointState, telemetry, currentStepIndex]);

  const activeStep = stepStates.find((step) => step.index === currentStepIndex) ?? null;

  const setStepContextField = useCallback((pointId: string, fieldId: string, value: ChecklistContextValue) => {
    setContextDrafts((prev) => {
      const key = getPointMapKey(selectedChecklistId, pointId);
      const current = prev[key] ?? {};
      return { ...prev, [key]: { ...current, [fieldId]: value } };
    });
  }, [selectedChecklistId]);

  const getStepContext = useCallback(
    (pointId: string): Record<string, ChecklistContextValue> => {
      const key = getPointMapKey(selectedChecklistId, pointId);
      return contextDrafts[key] ?? {};
    },
    [contextDrafts, selectedChecklistId],
  );

  const completeStep = useCallback(
    async (stepIndex: number): Promise<{ ok: boolean; error?: string }> => {
      if (!selectedChecklist) return { ok: false, error: 'Checklist not selected.' };

      const step = stepStates.find((state) => state.index === stepIndex);
      if (!step) return { ok: false, error: 'Checklist step does not exist.' };

      const allowed = canCompleteStep(
        stepIndex,
        currentStepIndex,
        step.validation.isAutoRule,
        step.validation.isValid,
        isReadOnly,
      );
      if (!allowed) {
        return { ok: false, error: 'Step completion blocked by sequence or validation.' };
      }

      const context = getStepContext(step.point.id);
      await publishChecklistPointState(selectedChecklist.id, step.point.id, {
        completed: true,
        completedAtWall: Date.now(),
        completedAtTelemetry: telemetry.lastPacketTimestamp,
        context,
      });
      return { ok: true };
    },
    [
      currentStepIndex,
      getStepContext,
      isReadOnly,
      publishChecklistPointState,
      selectedChecklist,
      stepStates,
      telemetry.lastPacketTimestamp,
    ],
  );

  const resetChecklist = useCallback(
    async (checklistId: string): Promise<{ ok: boolean; error?: string }> => {
      if (isReadOnly) return { ok: false, error: 'Checklist is read-only without MQTT connection.' };

      const checklist = definitions.find((item) => item.id === checklistId);
      if (!checklist) return { ok: false, error: 'Checklist not found.' };

      await Promise.all(
        checklist.points.map(async (point) => {
          await publishChecklistPointState(checklist.id, point.id, {
            completed: false,
            completedAtWall: null,
            completedAtTelemetry: null,
            context: {},
          });
        }),
      );
      return { ok: true };
    },
    [definitions, isReadOnly, publishChecklistPointState],
  );

  const resetAllChecklists = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (isReadOnly) return { ok: false, error: 'Checklist is read-only without MQTT connection.' };

    await Promise.all(
      definitions.map(async (definition) => {
        await Promise.all(
          definition.points.map(async (point) => {
            await publishChecklistPointState(definition.id, point.id, {
              completed: false,
              completedAtWall: null,
              completedAtTelemetry: null,
              context: {},
            });
          }),
        );
      }),
    );
    return { ok: true };
  }, [definitions, isReadOnly, publishChecklistPointState]);

  return {
    mode,
    isReadOnly,
    selectedChecklistId,
    setSelectedChecklistId,
    selectedChecklist,
    summaries,
    currentStepIndex,
    stepStates,
    activeStep,
    getStepContext,
    setStepContextField,
    completeStep,
    resetChecklist,
    resetAllChecklists,
  };
};
