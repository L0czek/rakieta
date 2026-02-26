import React, { useState } from 'react';

import { ChecklistStepState, ChecklistSummary } from '@/hooks/useChecklistEngine';
import { ChecklistMode, ChecklistContextValue } from '@/types/checklist';

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

const MODE_LABELS: Record<ChecklistMode, string> = {
  MQTT_SYNC: 'MQTT SYNC',
  SIM_LOCAL: 'SIM LOCAL',
  READ_ONLY_SNAPSHOT: 'READ ONLY SNAPSHOT',
};

const getStatusView = (step: ChecklistStepState): { symbol: string; className: string } => {
  if (!step.validation.isAutoRule) {
    return { symbol: 'M', className: 'text-amber-300 bg-amber-900/20 border-amber-600/40' };
  }
  if (step.validation.isValid) {
    return { symbol: '✓', className: 'text-green-300 bg-green-900/20 border-green-600/40' };
  }
  return { symbol: 'X', className: 'text-red-300 bg-red-900/20 border-red-600/40' };
};

export const ChecklistView: React.FC<ChecklistViewProps> = ({
  mode,
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
    <div className="h-full flex flex-col gap-2">
      <div className="bg-slate-950 border border-slate-800 rounded p-2 flex items-center gap-2">
        <select
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
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
          className="px-3 py-2 text-xs font-bold bg-slate-800 border border-slate-700 rounded text-slate-100 disabled:opacity-50"
          disabled={isReadOnly || isSubmitting}
          onClick={() => runAction(onResetChecklist)}
        >
          RESET CHECKLIST
        </button>
        <button
          className="px-3 py-2 text-xs font-bold bg-slate-800 border border-slate-700 rounded text-slate-100 disabled:opacity-50"
          disabled={isReadOnly || isSubmitting}
          onClick={() => runAction(onResetAllChecklists)}
        >
          RESET ALL CHECKLISTS
        </button>
        <div className="ml-auto px-3 py-1 rounded border border-cyan-600/40 text-cyan-300 text-xs font-bold">
          {MODE_LABELS[mode]}
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-900/40 border border-red-700 text-red-100 px-3 py-2 rounded text-sm">
          {errorMessage}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto bg-slate-950 border border-slate-800 rounded">
          {stepStates.map((step) => {
            const status = getStatusView(step);
            const inlineContext = getStepContext(step.point.id);
            const baseRowClass =
              'grid grid-cols-[1fr_220px] border-b border-slate-800 text-sm font-mono';
            const rowClass = step.isCurrent
              ? `${baseRowClass} bg-slate-900/70`
              : `${baseRowClass} bg-slate-950`;
            return (
              <div key={step.point.id} className="border-b border-slate-800 last:border-b-0">
                <div className={rowClass}>
                  <div className="px-3 py-3 text-slate-200">
                    <div className="font-semibold tracking-wide">{step.point.callout}</div>
                    {step.point.note && <div className="text-xs text-slate-400 mt-1">{step.point.note}</div>}
                  </div>
                  <div
                    className={`px-3 py-3 border-l text-right ${status.className} ${
                      step.isLocked ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="font-bold">{step.point.response}</div>
                    <div className="text-xs mt-1">{status.symbol}</div>
                  </div>
                </div>
                {step.isCurrent && (
                  <div
                    data-testid="inline-current-step-controls"
                    className="px-3 py-3 border-t border-slate-800 bg-slate-900/30 flex flex-col gap-3"
                  >
                    <div className="text-xs text-slate-300">
                      Live: <span className="font-semibold text-slate-100">{step.validation.displayValue}</span>
                    </div>

                    {(step.point.contextFields ?? []).map((field) => (
                      <label key={field.id} className="text-xs text-slate-300 flex flex-col gap-1">
                        {field.label}
                        <input
                          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
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
                      className="self-start px-3 py-2 rounded bg-cyan-600 text-white font-bold text-sm disabled:opacity-50"
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
    </div>
  );
};
