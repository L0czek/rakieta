import React, { useState } from 'react';

import { ChecklistStepState, ChecklistSummary } from '@/hooks/useChecklistEngine';
import { ChecklistContextValue, ChecklistMode } from '@/types/checklist';

interface ChecklistViewProps {
  mode: ChecklistMode;
  summaries: ChecklistSummary[];
  selectedChecklistId: string;
  onSelectChecklist: (checklistId: string) => void;
  stepStates: ChecklistStepState[];
  activeStep: ChecklistStepState | null;
  getStepContext: (pointId: string) => Record<string, ChecklistContextValue>;
  setStepContextField: (pointId: string, fieldId: string, value: ChecklistContextValue) => void;
  onCompleteCurrentStep: (stepIndex: number) => Promise<{ ok: boolean; error?: string }>;
  onResetChecklist: () => Promise<{ ok: boolean; error?: string }>;
  onResetAllChecklists: () => Promise<{ ok: boolean; error?: string }>;
  isReadOnly: boolean;
}

const getStatusClassName = (step: ChecklistStepState): string => {
  if (!step.validation.isAutoRule) {
    return 'text-scada-warning-soft bg-scada-warning-soft border-scada-warning';
  }
  if (step.validation.isValid) {
    return 'text-scada-success-soft bg-scada-success-soft border-scada-success';
  }
  return 'text-scada-danger-soft bg-scada-danger-soft border-scada-danger';
};

const getRowClassName = (step: ChecklistStepState): string => {
  const baseClass =
    'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] text-sm font-mono border-b border-scada-weak';

  if (step.isCurrent) {
    return `${baseClass} border-l-4 md:border-l-8 border-scada-accent bg-scada-surface-soft-strong ` +
      'shadow-scada-accent-inset';
  }

  if (step.isCompleted) {
    return `${baseClass} border-l-2 md:border-l-4 border-scada-success bg-scada-success-soft`;
  }

  return `${baseClass} border-l-2 md:border-l-4 border-scada-weak bg-scada-app-soft`;
};

export const ChecklistView: React.FC<ChecklistViewProps> = ({
  mode: _mode,
  summaries,
  selectedChecklistId,
  onSelectChecklist,
  stepStates,
  activeStep,
  getStepContext,
  setStepContextField,
  onCompleteCurrentStep,
  onResetChecklist,
  onResetAllChecklists,
  isReadOnly,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runAction = async (action: () => Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await action();
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Action failed.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div
        className="bg-scada-app border border-scada-accent-soft rounded-sm p-2 flex flex-wrap items-center gap-2
          shadow-scada-accent-thin-inset"
      >
        <select
          aria-label="Select checklist"
          className="scada-input min-w-[190px] flex-1 rounded-sm text-sm tracking-wide"
          value={selectedChecklistId}
          onChange={(event) => onSelectChecklist(event.target.value)}
        >
          {summaries.map((summary) => (
            <option key={summary.checklistId} value={summary.checklistId}>
              {summary.label} ({summary.done}/{summary.total})
            </option>
          ))}
        </select>
        <button
          className="px-3 py-2.5 min-h-11 text-xs font-bold bg-scada-surface-elevated border border-scada rounded-sm
            text-scada-primary tracking-wider hover:border-[var(--scada-border-accent-soft)] disabled:opacity-50"
          disabled={isReadOnly || isSubmitting}
          onClick={() => runAction(onResetChecklist)}
        >
          RESET CHECKLIST
        </button>
        <button
          className="px-3 py-2.5 min-h-11 text-xs font-bold bg-scada-surface-elevated border border-scada rounded-sm
            text-scada-primary tracking-wider hover:border-[var(--scada-border-accent-soft)] disabled:opacity-50"
          disabled={isReadOnly || isSubmitting}
          onClick={() => runAction(onResetAllChecklists)}
        >
          RESET ALL CHECKLISTS
        </button>
      </div>

      {errorMessage && (
        <div className="bg-scada-danger-soft border border-scada-danger text-scada-danger-soft px-3 py-2 rounded text-sm">
          {errorMessage}
        </div>
      )}

      <div
        className="flex-1 min-h-0 relative flex flex-col rounded-sm overflow-hidden
          bg-scada-surface-soft-strong border border-scada-accent-soft"
      >
        <div
          className="px-2 py-1 text-xs font-bold tracking-widest border-b flex justify-between
            items-center bg-scada-accent-soft text-scada-accent-soft border-scada-accent-soft"
        >
          <span>CHECKLIST SEQUENCE</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {stepStates.map((step) => {
            const statusClassName = getStatusClassName(step);
            const rowClass = getRowClassName(step);
            const inlineContext = getStepContext(step.point.id);

            return (
              <div key={step.point.id} className="border-b border-scada-weak last:border-b-0">
                <div className={rowClass}>
                  <div className="px-3 py-3 text-scada-secondary">
                    <div className="font-semibold tracking-wide">{step.point.callout}</div>
                    {step.point.note && (
                      <div className="text-xs text-scada-secondary mt-1">{step.point.note}</div>
                    )}
                  </div>
                  <div
                    className={`px-3 py-3 md:border-l border-t md:border-t-0 text-left md:text-right
                      ${statusClassName} ${step.isLocked ? 'opacity-50' : ''}`}
                  >
                    <div className="font-bold">{step.point.response}</div>
                    {step.isCurrent && (
                      <div className="mt-1 text-[10px] font-bold tracking-wide text-scada-accent-bright">
                        📡 {step.validation.displayValue}
                      </div>
                    )}
                  </div>
                </div>

                {step.isCurrent && (
                  <div
                    data-testid="inline-current-step-controls"
                    className="px-3 py-3 border-t border-scada-weak bg-scada-surface-softer flex flex-col gap-3"
                  >
                    {(step.point.contextFields ?? []).map((field) => (
                      <label key={field.id} className="text-xs text-scada-secondary flex flex-col gap-1">
                        {field.label}
                        <input
                          className="scada-input rounded-sm px-2"
                          type={field.type}
                          placeholder={field.placeholder}
                          value={String(inlineContext[field.id] ?? '')}
                          onChange={(event) => {
                            const raw = event.target.value;
                            const value = field.type === 'number' && raw !== '' ? Number(raw) : raw;
                            setStepContextField(step.point.id, field.id, value);
                          }}
                        />
                      </label>
                    ))}

                    <button
                      className="self-start px-3 py-2.5 min-h-11 rounded-sm bg-scada-accent-strong text-scada-inverse font-bold text-sm
                        tracking-wide border border-scada-accent shadow-scada-accent-sm
                        disabled:opacity-50"
                      disabled={
                        isReadOnly ||
                        isSubmitting ||
                        (step.validation.isAutoRule && !step.validation.isValid)
                      }
                      onClick={() => runAction(() => onCompleteCurrentStep(step.index))}
                    >
                      COMPLETE STEP
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!activeStep && (
            <div className="px-3 py-3 text-sm text-scada-success-soft font-semibold">Checklist complete.</div>
          )}
        </div>
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-scada-accent"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-scada-accent"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-scada-accent"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-scada-accent"></div>
      </div>
    </div>
  );
};
