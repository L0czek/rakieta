import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isControllerReboot, useMqttSystem } from '@/hooks/useMqttSystem';
import { ConnectionState } from '@/types';
import * as DB from '@/utils/db';

describe('isControllerReboot', () => {
  it('ignores the first packet and small reordering', () => {
    expect(isControllerReboot(0, 0)).toBe(false);
    expect(isControllerReboot(5000, 4100)).toBe(false);
    expect(isControllerReboot(5000, 6000)).toBe(false);
  });

  it('flags a clock that stepped back by more than a second', () => {
    expect(isControllerReboot(5000, 3999)).toBe(true);
    expect(isControllerReboot(3_600_000, 4200)).toBe(true);
  });
});

describe('useMqttSystem controller reboot', () => {
  beforeEach(async () => {
    await DB.clearDB();
  });

  afterEach(cleanup);

  it('continues in a new boot and keeps the previous history', async () => {
    const { result } = renderHook(() => useMqttSystem());
    await waitFor(() => expect(result.current.boots).toHaveLength(1));

    // The simulator loops packets straight into the hook while MQTT is disconnected.
    act(() => result.current.toggleSimulation(true));
    await waitFor(() => expect(result.current.telemetry.lastPacketTimestamp).toBeGreaterThan(1500), {
      timeout: 5000,
    });
    expect(result.current.telemetry.bootId).toBe(1);

    // Restarting the simulator restarts its clock at zero, like a controller reboot.
    act(() => result.current.toggleSimulation(false));
    act(() => result.current.toggleSimulation(true));

    await waitFor(() => expect(result.current.telemetry.bootId).toBe(2), { timeout: 5000 });
    expect(result.current.rebootNotice?.bootId).toBe(2);
    expect(result.current.connectionStatus).toBe(ConnectionState.DISCONNECTED);
    expect(result.current.isSimulating).toBe(true);
    expect(result.current.telemetry.lastPacketTimestamp).toBeLessThan(1500);

    await waitFor(() => expect(result.current.boots.map((boot) => boot.id)).toEqual([1, 2]));
    const firstBoot = result.current.boots[0];
    expect(firstBoot.end).toBeGreaterThan(1000);
    const stored = await DB.getMeasurementsInRange(1, 'tensometer', 0, firstBoot.end);
    expect(stored.length).toBeGreaterThan(0);

    act(() => result.current.dismissRebootNotice());
    expect(result.current.rebootNotice).toBeNull();

    act(() => result.current.toggleSimulation(false));
  }, 15000);
});
