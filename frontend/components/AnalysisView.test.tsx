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
  bootId: 1,
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

const renderView = (onClearHistory: () => Promise<void> = async () => {}) =>
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

describe('AnalysisView controller boots', () => {
  afterEach(cleanup);

  const boots = [
    { id: 1, firstSeenAtWall: 1000, start: 5000, end: 6500 },
    { id: 2, firstSeenAtWall: 2000, start: 0, end: 3000 },
  ];
  const liveTelemetry: SystemTelemetry = { ...telemetry, bootId: 2, lastPacketTimestamp: 3000 };

  const renderWithBoots = () =>
    render(
      <AnalysisView
        telemetry={liveTelemetry}
        actions={actions}
        connectionStatus={ConnectionState.DISCONNECTED}
        isSimulating={false}
        commandsEnabled={false}
        boots={boots}
      />,
    );

  it('offers no boot selector while there is a single boot', () => {
    renderView();
    expect(screen.queryByLabelText('Controller boot')).not.toBeInTheDocument();
  });

  it('shows the current boot first and switches the timeline to an earlier one', async () => {
    renderWithBoots();

    const selector = screen.getByLabelText('Controller boot') as HTMLSelectElement;
    expect(selector.value).toBe('2');
    expect(screen.getByRole('option', { name: /BOOT 2 \(CURRENT\)/ })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('3')).toBe(screen.getByLabelText('End (s)'));

    fireEvent.change(selector, { target: { value: '1' } });

    expect(selector.value).toBe('1');
    expect(await screen.findByDisplayValue('6.5')).toBe(screen.getByLabelText('End (s)'));
    expect(screen.getByLabelText('Begin (s)')).toHaveValue('5');
  });
});
