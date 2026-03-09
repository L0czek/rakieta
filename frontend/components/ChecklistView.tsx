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
    'grid grid-cols-[2.5rem_minmax(0,1fr)] md:grid-cols-[3.25rem_minmax(0,1fr)] text-sm font-mono border-b border-scada-weak';

  if (step.isCurrent) {
    return `${baseClass} border-l-4 border-scada-accent bg-scada-surface-soft-strong shadow-scada-accent-inset`;
  }

  if (step.isCompleted) {
    return `${baseClass} border-l-2 border-scada-success bg-scada-success-soft`;
  }

  return `${baseClass} border-l-2 border-scada-weak bg-scada-app-soft`;
};

const getStepNumber = (index: number): string => String(index + 1).padStart(2, '0');

const formatDelta = (value: number, decimals: number): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}`;
};

const getAutoValidationSummary = (step: ChecklistStepState): string | null => {
  if (!step.validation.isAutoRule) return null;

  const rule = step.point.rule;
  if (rule.type === 'number_range') {
    const decimals = rule.decimals ?? 1;
    const rawCurrent = Number(step.validation.displayValue);
    const unit = rule.unit ? ` ${rule.unit.toUpperCase()}` : '';
    const required = `${rule.min.toFixed(decimals)}-${rule.max.toFixed(decimals)}${unit}`;

    if (!Number.isFinite(rawCurrent)) {
      return `LIVE -- | REQUIRED ${required}`;
    }

    if (step.validation.isValid) {
      return `LIVE ${rawCurrent.toFixed(decimals)}${unit} | REQUIRED ${required} | OK`;
    }

    const nearestBound = rawCurrent < rule.min ? rule.min : rule.max;
    const delta = rawCurrent - nearestBound;
    return `LIVE ${rawCurrent.toFixed(decimals)}${unit} | REQUIRED ${required} | DELTA ${formatDelta(delta, decimals)}${unit}`;
  }

  if (rule.type === 'boolean_equals') {
    const expected = rule.equals ? 'TRUE' : 'FALSE';
    return `LIVE ${step.validation.displayValue} | REQUIRED ${expected} | ${step.validation.isValid ? 'OK' : 'MISMATCH'}`;
  }

  if (rule.type === 'enum_equals') {
    return `LIVE ${step.validation.displayValue} | REQUIRED ${String(rule.equals)} | ${step.validation.isValid ? 'OK' : 'MISMATCH'}`;
  }

  return null;
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
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});

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

  const toggleStepExpanded = (stepId: string): void => {
    setExpandedStepIds((previous) => ({
      ...previous,
      [stepId]: !previous[stepId],
    }));
  };

  const selectedSummary = summaries.find((summary) => summary.checklistId === selectedChecklistId) ?? null;
  const doneCount = selectedSummary?.done ?? 0;
  const totalCount = selectedSummary?.total ?? stepStates.length;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="h-full min-h-0 flex flex-col gap-1 md:gap-2">
      <div
        className="bg-scada-app border border-scada-accent-soft rounded-sm p-1.5 md:p-2 flex flex-col gap-1.5 md:gap-2
          shadow-scada-accent-thin-inset"
      >
        <div className="flex flex-wrap items-center gap-2">
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
            className="delight-press md:hidden px-3 py-2.5 min-h-11 text-xs font-bold bg-scada-surface-elevated border border-scada rounded-sm
              text-scada-primary tracking-wider hover-border-scada-accent-soft"
            aria-expanded={isMobileActionsOpen}
            onClick={() => setIsMobileActionsOpen((previous) => !previous)}
          >
            {isMobileActionsOpen ? 'HIDE ACTIONS' : 'MAINTENANCE'}
          </button>

          <div className="hidden md:flex items-center gap-2">
            <button
              className="delight-press px-3 py-2.5 min-h-11 text-xs font-bold bg-scada-surface-elevated border border-scada rounded-sm
                text-scada-primary tracking-wider hover-border-scada-accent-soft disabled:opacity-50"
              disabled={isReadOnly || isSubmitting}
              onClick={() => runAction(onResetChecklist)}
            >
              RESET CHECKLIST
            </button>
            <button
              className="delight-press px-3 py-2.5 min-h-11 text-xs font-bold bg-scada-surface-elevated border border-scada rounded-sm
                text-scada-primary tracking-wider hover-border-scada-accent-soft disabled:opacity-50"
              disabled={isReadOnly || isSubmitting}
              onClick={() => runAction(onResetAllChecklists)}
            >
              RESET ALL CHECKLISTS
            </button>
          </div>
        </div>

        {isMobileActionsOpen && (
          <div className="md:hidden grid grid-cols-1 gap-2">
            <button
              className="delight-press px-3 py-2.5 min-h-11 text-xs font-bold bg-scada-surface-elevated border border-scada rounded-sm
                text-scada-primary tracking-wider hover-border-scada-accent-soft disabled:opacity-50"
              disabled={isReadOnly || isSubmitting}
              onClick={() => runAction(onResetChecklist)}
            >
              RESET CHECKLIST
            </button>
            <button
              className="delight-press px-3 py-2.5 min-h-11 text-xs font-bold bg-scada-surface-elevated border border-scada rounded-sm
                text-scada-primary tracking-wider hover-border-scada-accent-soft disabled:opacity-50"
              disabled={isReadOnly || isSubmitting}
              onClick={() => runAction(onResetAllChecklists)}
            >
              RESET ALL CHECKLISTS
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="h-2 rounded-sm bg-scada-surface-elevated border border-scada-weak overflow-hidden">
            <div
              className="h-full bg-scada-accent transition-[width] duration-200"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="flex items-center gap-3 text-[10px] tracking-[0.16em] text-scada-muted">
            <span>PROGRESS {doneCount}/{totalCount}</span>
            <span>ACTIVE {activeStep ? `STEP ${getStepNumber(activeStep.index)}` : 'COMPLETE'}</span>
          </div>
        </div>
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
          <span className="text-[10px] tracking-[0.18em] text-scada-accent-bright">CALL / RESPONSE</span>
        </div>
        <div className={`flex-1 min-h-0 overflow-auto ${activeStep ? 'pb-24' : 'pb-16'} md:pb-0`}>
          {stepStates.map((step) => {
            const statusClassName = getStatusClassName(step);
            const rowClass = getRowClassName(step);
            const inlineContext = getStepContext(step.point.id);
            const stepNumber = getStepNumber(step.index);
            const autoValidationSummary = getAutoValidationSummary(step);
            const isExpanded = expandedStepIds[step.point.id] ?? false;
            const showStepDetails = step.isCurrent || isExpanded;
            const compactStateLabel = step.isCompleted ? 'COMPLETE' : step.isLocked ? 'LOCKED' : 'PENDING';

            return (
              <div key={step.point.id}>
                <div className={rowClass}>
                  <div className="px-1.5 py-2 md:px-2 md:py-3 border-r border-scada-weak flex justify-center">
                    <div
                      className={`h-7 w-7 md:h-8 md:w-8 rounded-full border text-[10px] md:text-[11px] font-bold tracking-[0.08em]
                        flex items-center justify-center ${
                          step.isCurrent
                            ? 'border-scada-accent text-scada-accent bg-scada-accent-soft'
                            : step.isCompleted
                              ? 'border-scada-success text-scada-success-soft bg-scada-success-soft'
                              : 'border-scada text-scada-muted bg-scada-surface-elevated'
                        }`}
                    >
                      {stepNumber}
                    </div>
                  </div>

                  <div className={`px-2 py-2 md:px-3 md:py-3 ${step.isLocked ? 'opacity-50' : ''}`}>
                    {!step.isCurrent && (
                      <button
                        type="button"
                        className="md:hidden w-full rounded-sm border border-scada-weak bg-scada-surface-elevated px-2 py-2 text-left"
                        onClick={() => toggleStepExpanded(step.point.id)}
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-scada-primary tracking-wide">
                              {step.point.callout} | {step.point.response}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] tracking-[0.16em] ${
                              step.isCompleted ? 'text-scada-success-soft' : 'text-scada-muted'
                            }`}
                          >
                            {compactStateLabel}
                          </span>
                          <span className="text-[10px] tracking-[0.16em] text-scada-accent-bright">
                            {isExpanded ? 'HIDE' : 'MORE'}
                          </span>
                        </div>
                      </button>
                    )}

                    <div className={`${showStepDetails ? 'block' : 'hidden'} md:block`}>
                      <div className={`grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_280px] md:gap-3 ${step.isCurrent ? '' : 'mt-2 md:mt-0'}`}>
                        <div className="text-scada-secondary">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-[0.16em]">
                            {step.isCurrent && (
                              <span className="px-1.5 py-0.5 rounded-sm border border-scada-accent text-scada-accent-bright bg-scada-accent-soft">
                                CURRENT
                              </span>
                            )}
                            {step.isCompleted && (
                              <span className="px-1.5 py-0.5 rounded-sm border border-scada-success text-scada-success-soft bg-scada-success-soft">
                                COMPLETE
                              </span>
                            )}
                            {step.isLocked && (
                              <span className="px-1.5 py-0.5 rounded-sm border border-scada text-scada-muted bg-scada-surface-elevated">
                                LOCKED
                              </span>
                            )}
                          </div>

                          <div className="mt-0.5 font-semibold tracking-wide text-scada-primary">{step.point.callout}</div>
                          {step.point.note && (
                            <div className="text-xs text-scada-secondary mt-1">{step.point.note}</div>
                          )}
                        </div>

                        <div
                          className={`rounded-sm border px-3 py-2 text-left md:text-right
                            ${statusClassName}`}
                        >
                          <div className="text-[10px] tracking-[0.16em] opacity-80">RESPONSE</div>
                          <div className="font-bold">{step.point.response}</div>
                          {autoValidationSummary && (
                            <div
                              className={`mt-2 text-[10px] leading-snug tracking-[0.04em] ${
                                step.validation.isValid ? 'text-scada-success-soft' : 'text-scada-warning-soft'
                              } md:whitespace-nowrap`}
                            >
                              {autoValidationSummary}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {step.isCurrent && (
                      <div
                        data-testid="inline-current-step-controls"
                        className="mt-2 md:mt-3 rounded-sm border border-scada-accent-soft bg-scada-surface-softer overflow-hidden"
                      >
                        <div className="px-3 py-1.5 border-b border-scada-weak bg-scada-accent-soft text-scada-accent-bright text-[10px] tracking-[0.16em] font-bold">
                          CURRENT ACTION
                        </div>

                        <div className="px-2 py-2 md:px-3 md:py-3 flex flex-col gap-2 md:gap-3">
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
                            className="delight-press self-start px-3 py-2.5 min-h-11 rounded-sm bg-scada-accent-strong text-scada-inverse font-bold text-sm
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
                      </div>
                    )}
                  </div>
                </div>
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

      {activeStep && (
        <div
          data-testid="mobile-active-step-dock"
          className="md:hidden fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-30 rounded-sm border border-scada-accent-soft
            bg-scada-surface-soft-strong shadow-scada-accent-thin-inset"
        >
          <div className="px-3 py-1.5 border-b border-scada-weak bg-scada-accent-soft text-scada-accent-bright text-[10px] tracking-[0.16em] font-bold">
            ACTIVE STEP {getStepNumber(activeStep.index)}
          </div>
          <div className="px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs text-scada-primary font-semibold truncate">
                {activeStep.point.callout} | {activeStep.point.response}
              </div>
              <div className="text-[10px] tracking-[0.14em] text-scada-muted">
                {activeStep.validation.isAutoRule
                  ? activeStep.validation.isValid
                    ? 'AUTO CHECK PASS'
                    : 'AUTO CHECK PENDING'
                  : 'MANUAL CONFIRM'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
