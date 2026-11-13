import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChecklistView } from '@/components/ChecklistView';
import { ChecklistStepState } from '@/hooks/useChecklistEngine';
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
        onOverrideCurrentStep={vi.fn()}
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
        onOverrideCurrentStep={vi.fn()}
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
        onOverrideCurrentStep={vi.fn()}
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
    expect(within(dock).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/LIVE 35.2 BAR \| REQUIRED 40.0-50.0 BAR \| DELTA -4.8 BAR/i)).toBeInTheDocument();
  });

  it('keeps mobile summary on one line with action and response and allows expansion', () => {
    const mode: ChecklistMode = 'MQTT_SYNC';
    render(
      <ChecklistView
        mode={mode}
        summaries={[{ checklistId: 'preflight', label: 'PRE-FLIGHT', done: 0, total: 2 }]}
        selectedChecklistId="preflight"
        onSelectChecklist={vi.fn()}
        stepStates={[
          {
            index: 0,
            point: {
              id: 'tank_pressure',
              callout: 'TANK PRESSURE',
              response: '40-50 BAR',
              note: 'Match startup pressure envelope.',
              rule: { type: 'number_range', source: 'pressureTank', min: 40, max: 50, unit: 'bar', decimals: 1 },
            },
            runtimeState: {
              completed: true,
              completedAtWall: null,
              completedAtTelemetry: null,
              context: {},
            },
            validation: { isAutoRule: true, isValid: true, displayValue: '44.1' },
            isCurrent: false,
            isCompleted: true,
            isLocked: false,
          },
          {
            index: 1,
            point: {
              id: 'igniter_arm',
              callout: 'IGNITER ARM',
              response: 'ON',
              rule: { type: 'manual' },
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
          index: 1,
          point: {
            id: 'igniter_arm',
            callout: 'IGNITER ARM',
            response: 'ON',
            rule: { type: 'manual' },
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
        onOverrideCurrentStep={vi.fn()}
        onResetChecklist={vi.fn(async () => ({ ok: true }))}
        onResetAllChecklists={vi.fn(async () => ({ ok: true }))}
        isReadOnly={false}
      />,
    );

    const summaryToggle = screen.getByRole('button', { name: /TANK PRESSURE \| 40-50 BAR/i });
    expect(summaryToggle).toBeInTheDocument();
    expect(summaryToggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(summaryToggle);

    expect(summaryToggle).toHaveAttribute('aria-expanded', 'true');
  });

  describe('override', () => {
    const makeStep = (overrides: Partial<ChecklistStepState> = {}): ChecklistStepState => ({
      index: 0,
      point: {
        id: 'safety_switch',
        callout: 'Safety switch',
        response: 'ARMED',
        rule: { type: 'boolean_equals', source: 'isUnsafe', equals: true },
      },
      runtimeState: { completed: false, completedAtWall: null, completedAtTelemetry: null, context: {} },
      validation: { isAutoRule: true, isValid: false, displayValue: 'FALSE' },
      isCurrent: true,
      isCompleted: false,
      isLocked: false,
      ...overrides,
    });

    const renderView = (step: ChecklistStepState, onOverride = vi.fn(async () => ({ ok: true }))) => {
      const utils = render(
        <ChecklistView
          mode="MQTT_SYNC"
          summaries={[{ checklistId: 'list', label: 'LIST', done: 0, total: 1 }]}
          selectedChecklistId="list"
          onSelectChecklist={vi.fn()}
          stepStates={[step]}
          activeStep={step.isCurrent ? step : null}
          getStepContext={() => ({})}
          setStepContextField={vi.fn()}
          onCompleteCurrentStep={vi.fn(async () => ({ ok: true }))}
          onOverrideCurrentStep={onOverride}
          onResetChecklist={vi.fn(async () => ({ ok: true }))}
          onResetAllChecklists={vi.fn(async () => ({ ok: true }))}
          isReadOnly={false}
        />,
      );
      return { ...utils, onOverride };
    };

    it('overrides a failing auto step only after a reason is typed in', async () => {
      const { container, onOverride } = renderView(makeStep());
      const view = within(container);

      expect(view.getByRole('button', { name: 'COMPLETE STEP' })).toBeDisabled();
      const overrideButton = view.getByRole('button', { name: 'OVERRIDE STEP' });
      expect(overrideButton).toBeDisabled();

      fireEvent.change(view.getByLabelText('Override reason'), { target: { value: 'switch sense broken' } });
      expect(overrideButton).toBeEnabled();
      fireEvent.click(overrideButton);

      await waitFor(() => expect(onOverride).toHaveBeenCalledWith(0, 'switch sense broken'));
    });

    it('offers no override while the check passes or on a manual step', () => {
      const passing = renderView(makeStep({ validation: { isAutoRule: true, isValid: true, displayValue: 'TRUE' } }));
      expect(within(passing.container).queryByRole('button', { name: 'OVERRIDE STEP' })).not.toBeInTheDocument();

      const manual = renderView(
        makeStep({
          point: { id: 'confirm', callout: 'Confirm', response: 'DONE', rule: { type: 'manual' } },
          validation: { isAutoRule: false, isValid: true, displayValue: 'MANUAL' },
        }),
      );
      expect(within(manual.container).queryByRole('button', { name: 'OVERRIDE STEP' })).not.toBeInTheDocument();
    });

    it('shows an overridden step as overridden with its reason, not as complete', () => {
      const { container } = renderView(
        makeStep({
          isCurrent: false,
          isCompleted: true,
          runtimeState: {
            completed: true,
            completedAtWall: 1,
            completedAtTelemetry: 2,
            context: {},
            overridden: true,
            overrideReason: 'switch sense broken',
          },
        }),
      );
      const view = within(container);

      expect(view.getAllByText('OVERRIDDEN').length).toBeGreaterThan(0);
      expect(view.queryByText('COMPLETE')).not.toBeInTheDocument();
      expect(view.getByText('Override reason: switch sense broken')).toBeInTheDocument();
    });
  });
});
