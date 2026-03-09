import React from 'react';
import { ScadaPanel } from '@/components/Widgets';
import { SystemState } from '@/types';
import { AlertOctagon, Lock, Flame, RefreshCcw, Power } from 'lucide-react';

interface ControlPanelProps {
  systemState: SystemState;
  isUnsafe: boolean; // physical switch state
  commandsEnabled: boolean;
  actions: {
    setFireState: (cmd: 'FIRE' | 'FIRE_END' | 'FIRE_RESET') => void;
    requestShutdown: () => void;
  };
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  systemState,
  isUnsafe,
  commandsEnabled,
  actions,
}) => {
  const [showShutdownConfirm, setShowShutdownConfirm] = React.useState(false);
  
  const isArmed = systemState === SystemState.ARMED;
  const isFiring = systemState === SystemState.FIRE;
  const canFire = isArmed && isUnsafe && commandsEnabled;
  const canAbort = commandsEnabled;
  const canShutdown = !isFiring && commandsEnabled;

  const fireHint = (() => {
    if (!commandsEnabled) return 'CONNECT OR START SIM';
    if (!isArmed) return 'SET STATE TO ARMED';
    if (!isUnsafe) return 'SET SAFETY SWITCH TO ARMED';
    return 'READY';
  })();
  
  const stateColor = {
    [SystemState.ARMED]: 'text-scada-warning-soft border-scada-warning bg-scada-warning-soft',
    [SystemState.FIRE]: 'text-scada-danger-soft border-scada-danger bg-scada-danger-soft',
    [SystemState.POSTFIRE]: 'text-scada-info border-scada-info bg-scada-info-soft',
    [SystemState.UNKNOWN]: 'text-scada-muted border-scada bg-scada-surface-elevated'
  }[systemState];

  return (
    <>
      {showShutdownConfirm && (
        <div className="fixed inset-0 z-[90] bg-scada-warning-overlay backdrop-blur-md flex items-center justify-center p-8">
          <div className="w-full max-w-xl rounded-lg border-2 border-scada-warning bg-scada-warning-overlay p-6 shadow-scada-warning-lg">
            <h2 className="text-2xl font-bold tracking-wide text-scada-warning-soft mb-3">SHUTDOWN</h2>
            <p className="mb-2 text-sm text-scada-warning-soft">
              Put the charger into shipping mode and shut down the CPU.
            </p>
            <p className="mb-2 text-sm text-scada-warning-soft">
              Device will require a wakeup by plugging in a USB cable to start again.
            </p>
            <p className="mb-5 text-sm text-scada-warning-soft">
              If the cable is currently plugged in, the shutdown will take effect after unplugging it.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowShutdownConfirm(false)}
                className="delight-press flex-1 py-3 bg-scada-surface-strong hover-bg-scada-surface-strong text-scada-primary font-bold rounded border border-scada-strong transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  actions.requestShutdown();
                  setShowShutdownConfirm(false);
                }}
                disabled={!commandsEnabled}
                className="delight-press flex-1 py-3 bg-scada-warning hover-bg-scada-warning text-scada-inverse font-bold rounded border border-scada-warning transition-colors flex items-center justify-center gap-2"
              >
                <Power className="w-4 h-4 delight-icon-shift" /> SHUTDOWN
              </button>
            </div>
          </div>
        </div>
      )}

      <ScadaPanel title="MASTER CONTROL" className="h-full" danger={isFiring}>
        <div className="flex flex-col gap-2 p-1 md:h-full">
        
        {/* Top Row: Indicators */}
        <div className="flex gap-2 min-h-[60px] md:h-1/4">
            {/* System State */}
            <div className={`flex-1 border-2 rounded text-center flex flex-col justify-center items-center ${stateColor}`}>
                <span className="text-[10px] tracking-widest opacity-70 mb-1 leading-none">STATE</span>
                <span className="text-xl font-bold font-mono leading-none">{systemState}</span>
            </div>

            {/* Physical Safety Status */}
            <div className={`flex-1 border rounded text-center flex flex-col justify-center items-center transition-colors ${isUnsafe ? 'bg-scada-danger-soft border-scada-danger text-scada-danger-soft' : 'bg-scada-success-soft border-scada-success text-scada-success-soft'}`}>
                <div className="text-[10px] uppercase tracking-widest mb-1 leading-none">SAFETY</div>
                <div className="font-bold flex items-center justify-center gap-2 leading-none">
                    {isUnsafe ? <AlertOctagon size={16}/> : <Lock size={16}/>}
                    {isUnsafe ? 'ARMED' : 'SAFE'}
                </div>
            </div>
        </div>

        {/* Middle Row: Big Button */}
        <div className="flex flex-col min-h-[140px] md:flex-1">
           {isFiring ? (
                <button 
                onClick={() => actions.setFireState('FIRE_END')}
                disabled={!canAbort}
                className="delight-press flex-1 bg-scada-warning hover-bg-scada-warning text-scada-inverse font-bold text-2xl border-4 border-scada-warning rounded flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
               >
                <div className="flex items-center gap-2">
                    <AlertOctagon className="w-8 h-8 delight-icon-shift" />
                    ABORT
                </div>
               </button>
           ) : (
               <button 
                onClick={() => actions.setFireState('FIRE')}
                disabled={!canFire}
                className={`delight-press flex-1 font-bold text-2xl border-2 rounded flex flex-col items-center justify-center transition-colors transition-shadow ${
                    canFire 
                    ? 'bg-scada-danger hover-bg-scada-danger-strong border-scada-danger text-scada-inverse shadow-scada-danger-md' 
                    : 'bg-scada-surface-elevated border-scada text-scada-muted cursor-not-allowed'
                }`}
               >
                <div className="flex items-center gap-2">
                     <Flame className="w-8 h-8 delight-icon-shift" />
                     FIRE
                </div>
                <div className={`mt-1 text-xs font-normal ${canFire ? 'text-scada-danger-soft' : 'text-scada-muted'}`}>
                  {fireHint}
                </div>
               </button>
           )}
        </div>

          {/* Bottom Row: Reset + Shutdown */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => actions.setFireState('FIRE_RESET')}
              disabled={!commandsEnabled}
              className="delight-press min-h-11 bg-scada-surface-strong hover-bg-scada-surface-strong text-scada-secondary font-mono text-xs border border-scada-strong rounded flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-3 h-3 delight-icon-shift" /> RESET STATE
            </button>
            <button
              onClick={() => setShowShutdownConfirm(true)}
              disabled={!canShutdown}
              className="delight-press min-h-11 bg-scada-warning-strong hover-bg-scada-warning text-scada-warning-soft font-mono text-xs border border-scada-warning rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Power className="w-3 h-3 delight-icon-shift" /> SHUTDOWN
            </button>
          </div>

        </div>
      </ScadaPanel>
    </>
  );
};
