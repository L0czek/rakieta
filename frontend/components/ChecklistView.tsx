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
    return 'text-amber-300 bg-amber-900/20 border-amber-600/40';
  }
  if (step.validation.isValid) {
    return 'text-green-300 bg-green-900/20 border-green-600/40';
  }
  return 'text-red-300 bg-red-900/20 border-red-600/40';
};

const getRowClassName = (step: ChecklistStepState): string => {
  const baseClass =
    'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] text-sm font-mono border-b border-slate-800/90';

  if (step.isCurrent) {
    return `${baseClass} border-l-4 md:border-l-8 border-cyan-300 bg-slate-900/85 ` +
      'shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35),0_0_16px_rgba(34,211,238,0.15)]';
  }

  if (step.isCompleted) {
    return `${baseClass} border-l-2 md:border-l-4 border-emerald-700/60 bg-emerald-950/15`;
  }

  return `${baseClass} border-l-2 md:border-l-4 border-slate-800 bg-slate-950/95`;
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
        className="bg-slate-950 border border-cyan-900/60 rounded-sm p-2 flex flex-wrap items-center gap-2
          shadow-[inset_0_0_0_1px_rgba(56,189,248,0.08)]"
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
          className="px-3 py-2.5 min-h-11 text-xs font-bold bg-slate-800 border border-slate-700 rounded-sm
            text-slate-100 tracking-wider hover:border-cyan-700/70 disabled:opacity-50"
          disabled={isReadOnly || isSubmitting}
          onClick={() => runAction(onResetChecklist)}
        >
          RESET CHECKLIST
        </button>
        <button
          className="px-3 py-2.5 min-h-11 text-xs font-bold bg-slate-800 border border-slate-700 rounded-sm
            text-slate-100 tracking-wider hover:border-cyan-700/70 disabled:opacity-50"
          disabled={isReadOnly || isSubmitting}
          onClick={() => runAction(onResetAllChecklists)}
        >
          RESET ALL CHECKLISTS
        </button>
      </div>

      {errorMessage && (
        <div className="bg-red-900/40 border border-red-700 text-red-100 px-3 py-2 rounded text-sm">
          {errorMessage}
        </div>
      )}

      <div
        className="flex-1 min-h-0 relative flex flex-col rounded-sm overflow-hidden
          bg-slate-800/70 border border-cyan-500/30"
      >
        <div
          className="px-2 py-1 text-xs font-bold tracking-widest border-b flex justify-between
            items-center bg-cyan-900/20 text-cyan-300 border-cyan-500/30"
        >
          <span>CHECKLIST SEQUENCE</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {stepStates.map((step) => {
            const statusClassName = getStatusClassName(step);
            const rowClass = getRowClassName(step);
            const inlineContext = getStepContext(step.point.id);

            return (
              <div key={step.point.id} className="border-b border-slate-800/90 last:border-b-0">
                <div className={rowClass}>
                  <div className="px-3 py-3 text-slate-200">
                    <div className="font-semibold tracking-wide">{step.point.callout}</div>
                    {step.point.note && (
                      <div className="text-xs text-slate-400 mt-1">{step.point.note}</div>
                    )}
                  </div>
                  <div
                    className={`px-3 py-3 md:border-l border-t md:border-t-0 text-left md:text-right
                      ${statusClassName} ${step.isLocked ? 'opacity-50' : ''}`}
                  >
                    <div className="font-bold">{step.point.response}</div>
                    {step.isCurrent && (
                      <div className="mt-1 text-[10px] font-bold tracking-wide text-cyan-200">
                        📡 {step.validation.displayValue}
                      </div>
                    )}
                  </div>
                </div>

                {step.isCurrent && (
                  <div
                    data-testid="inline-current-step-controls"
                    className="px-3 py-3 border-t border-slate-800 bg-slate-900/30 flex flex-col gap-3"
                  >
                    {(step.point.contextFields ?? []).map((field) => (
                      <label key={field.id} className="text-xs text-slate-300 flex flex-col gap-1">
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
                      className="self-start px-3 py-2.5 min-h-11 rounded-sm bg-cyan-700 text-white font-bold text-sm
                        tracking-wide border border-cyan-500/70 shadow-[0_0_10px_rgba(6,182,212,0.3)]
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
            <div className="px-3 py-3 text-sm text-green-300 font-semibold">Checklist complete.</div>
          )}
        </div>
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-400"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-400"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400"></div>
      </div>
    </div>
  );
};
