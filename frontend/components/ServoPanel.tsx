import React from 'react';
import { ScadaPanel, DigitalIndicator } from '@/components/Widgets';
import { ServoState, SystemState } from '@/types';

interface ServoPanelProps {
    servoPositionDegrees: number;
    servoState: ServoState;
    systemState: SystemState;
    commandsEnabled: boolean;
    actions: {
        setServoCmd: (cmd: 'OPEN' | 'CLOSE') => void;
    };
}

export const ServoPanel: React.FC<ServoPanelProps> = ({
    servoPositionDegrees,
    servoState,
    systemState,
    commandsEnabled,
    actions,
}) => {
    
    const canServo = systemState !== SystemState.FIRE && commandsEnabled;
    const degrees = servoPositionDegrees;
    const percent = (Math.max(0, Math.min(180, degrees)) / 180) * 100;

    return (
        <ScadaPanel title="SERVO DIAGNOSTICS & CONTROL" className="h-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 h-full p-1">
                {/* Left: Visualization */}
                <div className="flex flex-col justify-between">
                    <div>
                        <div className="mb-1 text-[10px] text-scada-muted">POSITION</div>
                        <div className="text-3xl font-mono text-scada-inverse">
                            {degrees.toFixed(0)}
                            <span className="ml-1 text-sm text-scada-muted">°</span>
                        </div>
                    </div>
                    
                    <div className="w-full bg-scada-surface-strong h-4 rounded-full overflow-hidden border border-scada-strong relative">
                        {/* Tick marks */}
                        <div className="absolute left-1/4 top-0 bottom-0 w-px bg-scada-border-strong opacity-30"></div>
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-scada-border-strong opacity-50"></div>
                        <div className="absolute left-3/4 top-0 bottom-0 w-px bg-scada-border-strong opacity-30"></div>
                        
                        <div className="bg-scada-accent h-full" style={{ width: `${percent}%` }}></div>
                    </div>
                </div>

                {/* Right: State & Controls */}
                <div className="flex flex-col gap-2">
                    <div className="flex gap-1 justify-center">
                        <DigitalIndicator active={servoState === ServoState.OPEN} label="OPN" tone="success" />
                        <DigitalIndicator active={servoState === ServoState.CLOSED} label="CLS" tone="warning" />
                    </div>

                    <div className="flex-1 flex gap-1 mt-1">
                         <button 
                            onClick={() => actions.setServoCmd('OPEN')}
                            disabled={!canServo}
                            className={`flex-1 min-h-11 rounded border border-scada-accent flex items-center justify-center text-xs font-bold md:min-h-0 ${servoState === ServoState.OPEN ? 'bg-scada-accent text-scada-inverse' : 'bg-scada-surface-elevated text-scada-accent hover:bg-[var(--scada-bg-surface-strong)]'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            OPEN
                        </button>
                        <button 
                            onClick={() => actions.setServoCmd('CLOSE')}
                            disabled={!canServo}
                            className={`flex-1 min-h-11 rounded border border-scada-accent flex items-center justify-center text-xs font-bold md:min-h-0 ${servoState === ServoState.CLOSED ? 'bg-scada-accent-soft text-scada-inverse' : 'bg-scada-surface-elevated text-scada-accent hover:bg-[var(--scada-bg-surface-strong)]'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            </div>
        </ScadaPanel>
    );
};
