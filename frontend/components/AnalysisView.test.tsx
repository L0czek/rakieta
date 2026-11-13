import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnalysisView } from '@/components/AnalysisView';
import { ConnectionState, ServoState, SystemState } from '@/types';
import type { SystemTelemetry } from '@/types';

// jsdom has no ResizeObserver; the chart only needs it to exist.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const telemetry: SystemTelemetry = {
  startTime: 0,
  lastPacketTimestamp: 0,
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
  state: SystemState.UNKNOWN,
  servoState: ServoState.UNKNOWN,
  cpuIdlePermille: null,
  wifiRssiDbm: null,
  statusLog: [],
};

const actions = {
  setFireState: vi.fn(),
  setServoCmd: vi.fn(),
  toggleSimSafety: vi.fn(),
  requestShutdown: vi.fn(),
};

const renderView = (onClearHistory: () => Promise<void>) =>
  render(
    <AnalysisView
      telemetry={telemetry}
      actions={actions}
      connectionStatus={ConnectionState.DISCONNECTED}
      isSimulating={false}
      commandsEnabled={false}
      onClearHistory={onClearHistory}
    />,
  );

describe('AnalysisView clear history', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('clears the history after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClearHistory = vi.fn().mockResolvedValue(undefined);
    renderView(onClearHistory);

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));

    expect(await screen.findByText('History cleared.')).toBeInTheDocument();
    expect(onClearHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps the history when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClearHistory = vi.fn().mockResolvedValue(undefined);
    renderView(onClearHistory);

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));

    expect(onClearHistory).not.toHaveBeenCalled();
  });
});
