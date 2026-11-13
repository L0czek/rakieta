import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  canCompleteStep,
  deriveChecklistMode,
  evaluateChecklistPoint,
  getCurrentStepIndex,
  useChecklistEngine,
} from '@/hooks/useChecklistEngine';
import { ConnectionState, ServoState, SystemState, SystemTelemetry } from '@/types';
import { ChecklistDefinition, ChecklistPointRuntimeState, ChecklistRule } from '@/types/checklist';

const makeTelemetry = (overrides: Partial<SystemTelemetry> = {}): SystemTelemetry => ({
  bootId: 1,
  startTime: 0,
  lastPacketTimestamp: 4200,
  avgFastAdcPacketLength: 0,
  countdownStartedAtWall: null,
  countdownEndsAtWall: null,
  tensometer: [],
  pressureTank: [],
  pressureCombustion: [],
  pressureTankRaw: null,
  pressureCombustionRaw: null,
  batteryStand: [],
  batteryComputer: [],
  boostVoltage: [],
  starterSense: [],
  isUnsafe: false,
  servoPosition: [],
  temperatures: {},
  state: SystemState.ARMED,
  servoState: ServoState.CLOSED,
  cpuIdlePermille: null,
  wifiRssiDbm: null,
  statusLog: [],
  ...overrides,
});

const evaluate = (rule: ChecklistRule, telemetry: SystemTelemetry) =>
  evaluateChecklistPoint({ id: 'p', callout: 'c', response: 'r', rule }, telemetry);

const temps = (...values: number[]): SystemTelemetry['temperatures'] =>
  Object.fromEntries(values.map((value, i) => [`t${i}`, [{ timestamp: 1, value: 99 }, { timestamp: 2, value }]]));

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

describe('wifi_rssi_above rule', () => {
  const rule: ChecklistRule = { type: 'wifi_rssi_above', min: -75 };

  it('fails without a reading', () => {
    expect(evaluate(rule, makeTelemetry())).toEqual({ isAutoRule: true, isValid: false, displayValue: '--' });
  });

  it('passes only above the limit', () => {
    expect(evaluate(rule, makeTelemetry({ wifiRssiDbm: -60 }))).toEqual({
      isAutoRule: true,
      isValid: true,
      displayValue: '-60',
    });
    expect(evaluate(rule, makeTelemetry({ wifiRssiDbm: -75 })).isValid).toBe(false);
    expect(evaluate(rule, makeTelemetry({ wifiRssiDbm: -82 })).isValid).toBe(false);
  });
});

describe('thermometers rule', () => {
  const rule: ChecklistRule = { type: 'thermometers', minCount: 2, min: -10, max: 40 };

  it('fails without sensors', () => {
    expect(evaluate(rule, makeTelemetry())).toEqual({
      isAutoRule: true,
      isValid: false,
      displayValue: 'NO SENSORS',
    });
    expect(evaluate(rule, makeTelemetry({ temperatures: { t0: [] } })).isValid).toBe(false);
  });

  it('fails with fewer sensors than required', () => {
    const result = evaluate(rule, makeTelemetry({ temperatures: temps(21) }));
    expect(result.isValid).toBe(false);
    expect(result.displayValue).toBe('1 SENSOR, 21.0 °C');
  });

  it('checks the latest value of every sensor', () => {
    const ok = evaluate(rule, makeTelemetry({ temperatures: temps(18.2, 24.1, 20) }));
    expect(ok).toEqual({
      isAutoRule: true,
      isValid: true,
      displayValue: '3 SENSORS, 18.2 to 24.1 °C',
      isStale: false,
    });

    expect(evaluate(rule, makeTelemetry({ temperatures: temps(20, 85) })).isValid).toBe(false);
    expect(evaluate(rule, makeTelemetry({ temperatures: temps(-40, 20) })).isValid).toBe(false);
    expect(evaluate(rule, makeTelemetry({ temperatures: temps(20, Number.NaN) })).isValid).toBe(false);
  });
});

describe('stale readings', () => {
  const pressure: ChecklistRule = { type: 'number_range', source: 'pressureTank', min: -3, max: 3 };
  const thermometers: ChecklistRule = { type: 'thermometers', minCount: 1, min: -10, max: 40 };
  const at = (timestamp: number, value: number) => [{ timestamp, value }];

  it('accepts a reading within the allowed age of the newest packet', () => {
    const telemetry = makeTelemetry({ lastPacketTimestamp: 20_000, pressureTank: at(15_000, 0.4) });
    expect(evaluate(pressure, telemetry)).toEqual({
      isAutoRule: true,
      isValid: true,
      displayValue: '0.40',
      isStale: false,
    });
  });

  it('fails an in-range reading that is older than the allowed age', () => {
    const telemetry = makeTelemetry({ lastPacketTimestamp: 20_000, pressureTank: at(14_999, 0.4) });
    expect(evaluate(pressure, telemetry)).toEqual({
      isAutoRule: true,
      isValid: false,
      displayValue: '0.40',
      isStale: true,
    });
  });

  it('fails the thermometers when one sensor has gone silent', () => {
    const telemetry = makeTelemetry({
      lastPacketTimestamp: 60_000,
      temperatures: { '1': at(59_500, 21), '2': at(30_000, 22) },
    });
    expect(evaluate(thermometers, telemetry)).toEqual({
      isAutoRule: true,
      isValid: false,
      displayValue: '2 SENSORS, 21.0 to 22.0 °C, 1 STALE',
      isStale: true,
    });
  });

  it('passes the thermometers when every sensor is recent', () => {
    const telemetry = makeTelemetry({
      lastPacketTimestamp: 60_000,
      temperatures: { '1': at(59_500, 21), '2': at(59_400, 22) },
    });
    expect(evaluate(thermometers, telemetry).isValid).toBe(true);
  });
});

describe('useChecklistEngine override', () => {
  const definitions: ChecklistDefinition[] = [
    {
      id: 'list',
      label: 'LIST',
      points: [
        { id: 'switch', callout: 'Safety switch', response: 'ARMED', rule: { type: 'boolean_equals', source: 'isUnsafe', equals: true } },
        { id: 'confirm', callout: 'Confirm', response: 'DONE', rule: { type: 'manual' } },
      ],
    },
  ];

  const setup = (pointStates: Record<string, ChecklistPointRuntimeState> = {}, connected = true) => {
    const publish = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChecklistEngine({
        telemetry: makeTelemetry(),
        connectionStatus: connected ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED,
        isSimulating: false,
        pointStates,
        publishChecklistPointState: publish,
        definitions,
      }),
    );
    return { result, publish };
  };

  it('does not complete a failing auto step without an override', async () => {
    const { result, publish } = setup();
    let outcome: { ok: boolean } = { ok: true };
    await act(async () => {
      outcome = await result.current.completeStep(0);
    });
    expect(outcome.ok).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('completes a failing auto step with a reason and marks it as overridden', async () => {
    const { result, publish } = setup();
    let outcome: { ok: boolean } = { ok: false };
    await act(async () => {
      outcome = await result.current.overrideStep(0, '  switch sense wire broken  ');
    });
    expect(outcome.ok).toBe(true);
    expect(publish).toHaveBeenCalledWith('list', 'switch', {
      completed: true,
      completedAtWall: expect.any(Number),
      completedAtTelemetry: 4200,
      context: {},
      overridden: true,
      overrideReason: 'switch sense wire broken',
    });
  });

  it('rejects an override without a reason', async () => {
    const { result, publish } = setup();
    let outcome: { ok: boolean } = { ok: true };
    await act(async () => {
      outcome = await result.current.overrideStep(0, '   ');
    });
    expect(outcome.ok).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects an override of a manual step, a step out of order, and in read-only mode', async () => {
    const done: ChecklistPointRuntimeState = {
      completed: true,
      completedAtWall: 1,
      completedAtTelemetry: 1,
      context: {},
    };

    const outOfOrder = setup();
    const manualStep = setup({ 'list/switch': done });
    const readOnly = setup({}, false);
    const outcomes: boolean[] = [];
    await act(async () => {
      outcomes.push((await outOfOrder.result.current.overrideStep(1, 'reason')).ok);
      outcomes.push((await manualStep.result.current.overrideStep(1, 'reason')).ok);
      outcomes.push((await readOnly.result.current.overrideStep(0, 'reason')).ok);
    });
    expect(outcomes).toEqual([false, false, false]);
    expect(outOfOrder.publish).not.toHaveBeenCalled();
    expect(manualStep.publish).not.toHaveBeenCalled();
    expect(readOnly.publish).not.toHaveBeenCalled();
  });

  it('clears the override when the list is reset', async () => {
    const { result, publish } = setup({
      'list/switch': {
        completed: true,
        completedAtWall: 1,
        completedAtTelemetry: 1,
        context: {},
        overridden: true,
        overrideReason: 'r',
      },
    });
    await act(async () => {
      await result.current.resetChecklist('list');
    });
    expect(publish).toHaveBeenCalledWith('list', 'switch', {
      completed: false,
      completedAtWall: null,
      completedAtTelemetry: null,
      context: {},
    });
  });
});
