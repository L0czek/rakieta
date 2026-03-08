import React from 'react';
import { ScadaPanel } from './Widgets';
import { SystemState } from '../types';
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
  
  const stateColor = {
    [SystemState.ARMED]: 'text-amber-500 border-amber-500/50 bg-amber-900/20',
    [SystemState.FIRE]: 'text-red-500 border-red-500/50 bg-red-900/20 animate-pulse',
    [SystemState.POSTFIRE]: 'text-blue-400 border-blue-500/50 bg-blue-900/20',
    [SystemState.UNKNOWN]: 'text-slate-500 border-slate-700 bg-slate-800'
  }[systemState];

  return (
    <>
      {showShutdownConfirm && (
        <div className="fixed inset-0 z-[90] bg-amber-950/80 backdrop-blur-md flex items-center justify-center p-8">
          <div className="w-full max-w-xl rounded-lg border-2 border-amber-500/80 bg-amber-950/95 p-6 shadow-[0_0_80px_rgba(245,158,11,0.35)]">
            <h2 className="text-2xl font-bold tracking-wide text-amber-200 mb-3">SHUTDOWN</h2>
            <p className="mb-2 text-sm text-amber-100/90">
              Put the charger into shipping mode and shut down the CPU.
            </p>
            <p className="mb-2 text-sm text-amber-100/90">
              Device will require a wakeup by plugging in a USB cable to start again.
            </p>
            <p className="mb-5 text-sm text-amber-100/90">
              If the cable is currently plugged in, the shutdown will take effect after unplugging it.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowShutdownConfirm(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold rounded border border-slate-500 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  actions.requestShutdown();
                  setShowShutdownConfirm(false);
                }}
                disabled={!commandsEnabled}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded border border-amber-400 transition-colors flex items-center justify-center gap-2"
              >
                <Power className="w-4 h-4" /> SHUTDOWN
              </button>
            </div>
          </div>
        </div>
      )}

      <ScadaPanel title="MASTER CONTROL" className="h-full" danger={isFiring}>
        <div className="flex flex-col h-full gap-2 p-1">
        
        {/* Top Row: Indicators */}
        <div className="flex gap-2 h-1/4 min-h-[60px]">
            {/* System State */}
            <div className={`flex-1 border-2 rounded text-center flex flex-col justify-center items-center ${stateColor}`}>
                <span className="text-[10px] tracking-widest opacity-70 mb-1 leading-none">STATE</span>
                <span className="text-xl font-bold font-mono leading-none">{systemState}</span>
            </div>

            {/* Physical Safety Status */}
            <div className={`flex-1 border rounded text-center flex flex-col justify-center items-center transition-colors ${isUnsafe ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-green-900/30 border-green-500 text-green-400'}`}>
                <div className="text-[10px] uppercase tracking-widest mb-1 leading-none">SAFETY</div>
                <div className="font-bold flex items-center justify-center gap-2 leading-none">
                    {isUnsafe ? <AlertOctagon size={16}/> : <Lock size={16}/>}
                    {isUnsafe ? 'ARMED' : 'SAFE'}
                </div>
            </div>
        </div>

        {/* Middle Row: Big Button */}
        <div className="flex-1 flex flex-col">
           {isFiring ? (
               <button 
                onClick={() => actions.setFireState('FIRE_END')}
                disabled={!canAbort}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-2xl border-4 border-amber-400 rounded flex flex-col items-center justify-center animate-pulse disabled:opacity-50 disabled:cursor-not-allowed"
               >
                <div className="flex items-center gap-2">
                    <AlertOctagon className="w-8 h-8" />
                    ABORT
                </div>
               </button>
           ) : (
               <button 
                onClick={() => actions.setFireState('FIRE')}
                disabled={!canFire}
                className={`flex-1 font-bold text-2xl border-2 rounded flex flex-col items-center justify-center transition-all ${
                    canFire 
                    ? 'bg-red-600 hover:bg-red-500 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)]' 
                    : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'
                }`}
               >
                <div className="flex items-center gap-2">
                     <Flame className="w-8 h-8" />
                     FIRE
                </div>
                <div className="text-xs font-normal opacity-70 mt-1">REQUIRES PHYSICAL ARM</div>
               </button>
           )}
        </div>

          {/* Bottom Row: Reset + Shutdown */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => actions.setFireState('FIRE_RESET')}
              disabled={!commandsEnabled}
              className="min-h-11 bg-slate-700 hover:bg-slate-600 text-slate-200 font-mono text-xs border border-slate-600 rounded flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-3 h-3" /> RESET STATE
            </button>
            <button
              onClick={() => setShowShutdownConfirm(true)}
              disabled={!canShutdown}
              className="min-h-11 bg-amber-700 hover:bg-amber-600 text-amber-50 font-mono text-xs border border-amber-500 rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Power className="w-3 h-3" /> SHUTDOWN
            </button>
          </div>

        </div>
      </ScadaPanel>
    </>
  );
};
