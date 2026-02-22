import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChecklistView } from '@/components/ChecklistView';
import { ChecklistMode } from '@/types/checklist';

describe('ChecklistView', () => {
  it('renders two-column aviation row and checklist progress labels', () => {
    const mode: ChecklistMode = 'MQTT_SYNC';
    render(
      <ChecklistView
        mode={mode}
        summaries={[
          { checklistId: 'preflight', label: 'PRE-FLIGHT', done: 1, total: 2 },
          { checklistId: 'pressurization', label: 'PRESSURIZATION', done: 0, total: 3 },
        ]}
        selectedChecklistId="preflight"
        onSelectChecklist={vi.fn()}
        stepStates={[
          {
            index: 0,
            point: {
              id: 'tank_pressure',
              callout: 'TANK PRESSURE',
              response: '40-50 BAR',
              rule: { type: 'number_range', source: 'pressureTank', min: 40, max: 50 },
            },
            runtimeState: {
              completed: false,
              completedAtWall: null,
              completedAtTelemetry: null,
              context: {},
            },
            validation: { isAutoRule: true, isValid: true, displayValue: '44.1' },
            isCurrent: true,
            isCompleted: false,
            isLocked: false,
          },
        ]}
        activeStep={null}
        getStepContext={() => ({})}
        setStepContextField={vi.fn()}
        onCompleteCurrentStep={vi.fn()}
        onResetChecklist={vi.fn()}
        onResetAllChecklists={vi.fn()}
        isReadOnly={false}
      />,
    );

    expect(screen.getByText('TANK PRESSURE')).toBeInTheDocument();
    expect(screen.getByText('40-50 BAR')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PRE-FLIGHT (1/2)' })).toBeInTheDocument();
  });
});
