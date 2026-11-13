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

/**
 * A reading counts as stale when it is this much older than the newest packet from the
 * controller. The controller publishes the ADC channels every 100 ms and each thermometer
 * once a second (20 samples at 50 ms), so this is several missed packets.
 *
 * The age is measured on the controller's clock, against the newest packet of any kind. It
 * shows a sensor that stopped while the rest of the telemetry goes on. It does not show a
 * lost link: then nothing advances.
 */
export const CHECKLIST_STALE_AFTER_MS = 5000;

const isStaleTimestamp = (timestamp: number, telemetry: SystemTelemetry): boolean =>
  telemetry.lastPacketTimestamp - timestamp > CHECKLIST_STALE_AFTER_MS;

const getNumericSourceValue = (
  source: string,
  telemetry: SystemTelemetry,
): { value: number; isStale: boolean } | null => {
  const raw = telemetry[source as keyof SystemTelemetry];
  if (typeof raw === 'number') return { value: raw, isStale: false };
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const last = raw[raw.length - 1] as { value?: unknown; timestamp?: unknown };
  if (typeof last.value !== 'number') return null;
  return {
    value: last.value,
    isStale: typeof last.timestamp === 'number' && isStaleTimestamp(last.timestamp, telemetry),
  };
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
    const reading = getNumericSourceValue(point.rule.source, telemetry);
    if (reading === null) {
      return { isAutoRule: true, isValid: false, displayValue: '--' };
    }

    return {
      isAutoRule: true,
      isValid: !reading.isStale && reading.value >= point.rule.min && reading.value <= point.rule.max,
      displayValue: formatNumeric(reading.value, point.rule.decimals),
      isStale: reading.isStale,
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

  if (point.rule.type === 'wifi_rssi_above') {
    const rssi = telemetry.wifiRssiDbm;
    if (rssi === null || Number.isNaN(rssi)) {
      return { isAutoRule: true, isValid: false, displayValue: '--' };
    }

    return {
      isAutoRule: true,
      isValid: rssi > point.rule.min,
      displayValue: rssi.toFixed(0),
    };
  }

  if (point.rule.type === 'thermometers') {
    const latestPoints = Object.values(telemetry.temperatures)
      .filter((history) => history.length > 0)
      .map((history) => history[history.length - 1]);
    const latestValues = latestPoints.map((latest) => latest.value);
    // A sensor that was seen since the controller started and has gone silent.
    const staleCount = latestPoints.filter((latest) => isStaleTimestamp(latest.timestamp, telemetry)).length;
    if (latestValues.length === 0) {
      return { isAutoRule: true, isValid: false, displayValue: 'NO SENSORS' };
    }

    const { min, max, minCount } = point.rule;
    const lowest = Math.min(...latestValues);
    const highest = Math.max(...latestValues);
    const range =
      latestValues.length === 1
        ? `${lowest.toFixed(1)} °C`
        : `${lowest.toFixed(1)} to ${highest.toFixed(1)} °C`;
    return {
      isAutoRule: true,
      // Written so that a NaN reading fails the check.
      isValid:
        staleCount === 0 &&
        latestValues.length >= minCount &&
        latestValues.every((value) => value >= min && value <= max),
      displayValue:
        `${latestValues.length} SENSOR${latestValues.length === 1 ? '' : 'S'}, ${range}` +
        (staleCount > 0 ? `, ${staleCount} STALE` : ''),
      isStale: staleCount > 0,
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

  const overrideStep = useCallback(
    async (stepIndex: number, reason: string): Promise<{ ok: boolean; error?: string }> => {
      if (!selectedChecklist) return { ok: false, error: 'Checklist not selected.' };
      if (isReadOnly) return { ok: false, error: 'Checklist is read-only without MQTT connection.' };

      const step = stepStates.find((state) => state.index === stepIndex);
      if (!step) return { ok: false, error: 'Checklist step does not exist.' };
      if (stepIndex !== currentStepIndex) {
        return { ok: false, error: 'Only the current step can be overridden.' };
      }
      if (!step.validation.isAutoRule) {
        return { ok: false, error: 'Manual steps cannot be overridden.' };
      }

      const trimmedReason = reason.trim();
      if (trimmedReason === '') return { ok: false, error: 'An override needs a reason.' };

      await publishChecklistPointState(selectedChecklist.id, step.point.id, {
        completed: true,
        completedAtWall: Date.now(),
        completedAtTelemetry: telemetry.lastPacketTimestamp,
        context: getStepContext(step.point.id),
        overridden: true,
        overrideReason: trimmedReason,
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
    overrideStep,
    resetChecklist,
    resetAllChecklists,
  };
};
