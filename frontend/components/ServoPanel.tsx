import React from 'react';
import { ScadaPanel, DigitalIndicator } from './Widgets';
import { ServoState, SystemState } from '../types';
import { rawServoToPercent } from '../utils/conversions';

interface ServoPanelProps {
    servoPosition: number;
    servoState: ServoState;
    systemState: SystemState;
    actions: {
        setServoCmd: (cmd: 'OPEN' | 'CLOSE') => void;
    };
}

export const ServoPanel: React.FC<ServoPanelProps> = ({ servoPosition, servoState, systemState, actions }) => {
    
    const canServo = systemState !== SystemState.FIRE;
    const percent = rawServoToPercent(servoPosition);

    return (
        <ScadaPanel title="SERVO DIAGNOSTICS & CONTROL" className="h-full">
            <div className="grid grid-cols-2 gap-2 h-full p-1">
                {/* Left: Visualization */}
                <div className="flex flex-col justify-between">
                    <div>
                        <div className="text-[10px] text-slate-500 mb-1">POSITION</div>
                        <div className="text-3xl font-mono text-white">{percent.toFixed(0)}<span className="text-sm text-slate-500 ml-1">%</span></div>
                    </div>
                    
                    <div className="w-full bg-slate-700 h-4 rounded-full overflow-hidden border border-slate-600 relative">
                        {/* Tick marks */}
                        <div className="absolute left-1/4 top-0 bottom-0 w-px bg-slate-500 opacity-30"></div>
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 opacity-50"></div>
                        <div className="absolute left-3/4 top-0 bottom-0 w-px bg-slate-500 opacity-30"></div>
                        
                        <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
                    </div>
                </div>

                {/* Right: State & Controls */}
                <div className="flex flex-col gap-2">
                    <div className="flex gap-1 justify-center">
                        <DigitalIndicator active={servoState === ServoState.OPEN} label="OPN" color="bg-green-500" />
                        <DigitalIndicator active={servoState === ServoState.CLOSED} label="CLS" color="bg-amber-500" />
                    </div>

                    <div className="flex-1 flex gap-1 mt-1">
                         <button 
                            onClick={() => actions.setServoCmd('OPEN')}
                            disabled={!canServo}
                            className={`flex-1 rounded border border-cyan-500/50 flex items-center justify-center text-xs font-bold ${servoState === ServoState.OPEN ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            OPEN
                        </button>
                        <button 
                            onClick={() => actions.setServoCmd('CLOSE')}
                            disabled={!canServo}
                            className={`flex-1 rounded border border-cyan-500/50 flex items-center justify-center text-xs font-bold ${servoState === ServoState.CLOSED ? 'bg-cyan-900/50 text-white' : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            </div>
        </ScadaPanel>
    );
};
