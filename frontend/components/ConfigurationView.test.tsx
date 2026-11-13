import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigurationView } from '@/components/ConfigurationView';

// jsdom has no ResizeObserver; the LUT chart only needs it to exist.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe('ConfigurationView publish status', () => {
  afterEach(cleanup);

  it('reports a publish when MQTT accepted the settings', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    render(<ConfigurationView publishConversionSettings={publish} />);

    fireEvent.click(screen.getByRole('button', { name: 'RESET TO DEFAULTS' }));

    expect(await screen.findByText('RESET TO DEFAULTS & PUBLISHED')).toBeInTheDocument();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('says so when MQTT is disconnected and nothing was published', async () => {
    const publish = vi.fn().mockResolvedValue(false);
    render(<ConfigurationView publishConversionSettings={publish} />);

    fireEvent.click(screen.getByRole('button', { name: 'RESET TO DEFAULTS' }));

    expect(await screen.findByText(/NOT PUBLISHED/)).toBeInTheDocument();
    expect(screen.queryByText(/& PUBLISHED/)).not.toBeInTheDocument();
  });
});
