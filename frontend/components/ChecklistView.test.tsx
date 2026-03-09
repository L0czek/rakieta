import { render, screen, within } from '@testing-library/react';
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

  it('renders current step controls inline with the active checklist item', () => {
    const mode: ChecklistMode = 'MQTT_SYNC';
    const { container } = render(
      <ChecklistView
        mode={mode}
        summaries={[{ checklistId: 'preflight', label: 'PRE-FLIGHT', done: 0, total: 1 }]}
        selectedChecklistId="preflight"
        onSelectChecklist={vi.fn()}
        stepStates={[
          {
            index: 0,
            point: {
              id: 'experiment_name',
              callout: 'Name of experiment',
              response: 'RECORDED',
              rule: { type: 'manual' },
              contextFields: [{ id: 'experimentName', label: 'Experiment Name', type: 'text' }],
            },
            runtimeState: {
              completed: false,
              completedAtWall: null,
              completedAtTelemetry: null,
              context: {},
            },
            validation: { isAutoRule: false, isValid: true, displayValue: 'MANUAL' },
            isCurrent: true,
            isCompleted: false,
            isLocked: false,
          },
        ]}
        activeStep={{
          index: 0,
          point: {
            id: 'experiment_name',
            callout: 'Name of experiment',
            response: 'RECORDED',
            rule: { type: 'manual' },
            contextFields: [{ id: 'experimentName', label: 'Experiment Name', type: 'text' }],
          },
          runtimeState: {
            completed: false,
            completedAtWall: null,
            completedAtTelemetry: null,
            context: {},
          },
          validation: { isAutoRule: false, isValid: true, displayValue: 'MANUAL' },
          isCurrent: true,
          isCompleted: false,
          isLocked: false,
        }}
        getStepContext={() => ({})}
        setStepContextField={vi.fn()}
        onCompleteCurrentStep={vi.fn(async () => ({ ok: true }))}
        onResetChecklist={vi.fn(async () => ({ ok: true }))}
        onResetAllChecklists={vi.fn(async () => ({ ok: true }))}
        isReadOnly={false}
      />,
    );

    expect(within(container).getByTestId('inline-current-step-controls')).toBeInTheDocument();
    expect(within(container).getByRole('button', { name: 'COMPLETE STEP' })).toBeInTheDocument();
  });

  it('shows mobile active-step dock and mismatch explainer for failed auto checks', () => {
    const mode: ChecklistMode = 'MQTT_SYNC';
    render(
      <ChecklistView
        mode={mode}
        summaries={[{ checklistId: 'pressurization', label: 'PRESSURIZATION', done: 0, total: 1 }]}
        selectedChecklistId="pressurization"
        onSelectChecklist={vi.fn()}
        stepStates={[
          {
            index: 0,
            point: {
              id: 'tank_pressure',
              callout: 'Tank pressure',
              response: '40-50 BAR',
              rule: { type: 'number_range', source: 'pressureTank', min: 40, max: 50, unit: 'bar', decimals: 1 },
            },
            runtimeState: {
              completed: false,
              completedAtWall: null,
              completedAtTelemetry: null,
              context: {},
            },
            validation: { isAutoRule: true, isValid: false, displayValue: '35.2' },
            isCurrent: true,
            isCompleted: false,
            isLocked: false,
          },
        ]}
        activeStep={{
          index: 0,
          point: {
            id: 'tank_pressure',
            callout: 'Tank pressure',
            response: '40-50 BAR',
            rule: { type: 'number_range', source: 'pressureTank', min: 40, max: 50, unit: 'bar', decimals: 1 },
          },
          runtimeState: {
            completed: false,
            completedAtWall: null,
            completedAtTelemetry: null,
            context: {},
          },
          validation: { isAutoRule: true, isValid: false, displayValue: '35.2' },
          isCurrent: true,
          isCompleted: false,
          isLocked: false,
        }}
        getStepContext={() => ({})}
        setStepContextField={vi.fn()}
        onCompleteCurrentStep={vi.fn(async () => ({ ok: true }))}
        onResetChecklist={vi.fn(async () => ({ ok: true }))}
        onResetAllChecklists={vi.fn(async () => ({ ok: true }))}
        isReadOnly={false}
      />,
    );

    const docks = screen.getAllByTestId('mobile-active-step-dock');
    const dock = docks[docks.length - 1];
    expect(dock).toBeInTheDocument();
    expect(within(dock).getByText(/ACTIVE STEP 01/i)).toBeInTheDocument();
    expect(within(dock).getByText(/AUTO CHECK PENDING/i)).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'COMPLETE ACTIVE STEP' })).toBeInTheDocument();
    expect(screen.getByText(/LIVE 35.2 BAR \| REQUIRED 40.0-50.0 BAR \| DELTA -4.8 BAR/i)).toBeInTheDocument();
  });
});
