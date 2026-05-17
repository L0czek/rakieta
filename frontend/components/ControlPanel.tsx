import React from 'react';
import { ScadaPanel } from '@/components/Widgets';
import { SystemState } from '@/types';
import { AlertOctagon, Lock, Flame, RefreshCcw, Power, Lightbulb, Camera } from 'lucide-react';

interface ControlPanelProps {
  systemState: SystemState;
  isUnsafe: boolean; // physical switch state
  countdownEndsAtWall: number | null;
  commandsEnabled: boolean;
  actions: {
    setFireState: (cmd: 'FIRE' | 'ABORT' | 'FIRE_END' | 'FIRE_RESET' | 'LAMP_TEST' | 'CAMERA_TEST') => void;
    requestShutdown: () => void;
  };
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  systemState,
  isUnsafe,
  countdownEndsAtWall,
  commandsEnabled,
  actions,
}) => {
  const [showShutdownConfirm, setShowShutdownConfirm] = React.useState(false);
  const [countdownNow, setCountdownNow] = React.useState(Date.now());
  
  const isArmed = systemState === SystemState.ARMED;
  const isCountdown = systemState === SystemState.COUNTDOWN;
  const isFiring = systemState === SystemState.FIRE;
  const canFire = isArmed && isUnsafe && commandsEnabled;
  const canAbortCountdown = isCountdown && commandsEnabled;
  const canEndFire = isFiring && commandsEnabled;
  const canReset = systemState === SystemState.POSTFIRE && commandsEnabled;
  const canShutdown = !isFiring && !isCountdown && commandsEnabled;
  const countdownRemainingMs = isCountdown && countdownEndsAtWall !== null
    ? Math.max(0, countdownEndsAtWall - countdownNow)
    : 0;
  const countdownRemainingSeconds = countdownRemainingMs / 1000;

  React.useEffect(() => {
    if (!isCountdown) return undefined;
    setCountdownNow(Date.now());
    const intervalId = window.setInterval(() => setCountdownNow(Date.now()), 40);
    return () => window.clearInterval(intervalId);
  }, [isCountdown, countdownEndsAtWall]);

  const fireHint = (() => {
    if (!commandsEnabled) return 'CONNECT OR START SIM';
    if (!isArmed) return 'SET STATE TO ARMED';
    if (!isUnsafe) return 'SET SAFETY SWITCH TO ARMED';
    return 'READY';
  })();
  
  const stateColor = {
    [SystemState.ARMED]: 'text-scada-warning-soft border-scada-warning bg-scada-warning-soft',
    [SystemState.COUNTDOWN]: 'text-scada-warning border-scada-warning bg-scada-warning-strong',
    [SystemState.FIRE]: 'text-scada-danger-soft border-scada-danger bg-scada-danger-soft',
    [SystemState.POSTFIRE]: 'text-scada-info border-scada-info bg-scada-info-soft',
    [SystemState.LAMPTEST]: 'text-scada-info border-scada-info bg-scada-info-soft',
    [SystemState.CAMERATEST]: 'text-scada-info border-scada-info bg-scada-info-soft',
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
                disabled={!canShutdown}
                className="delight-press flex-1 py-3 bg-scada-warning hover-bg-scada-warning text-scada-inverse font-bold rounded border border-scada-warning transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Power className="w-4 h-4 delight-icon-shift" /> SHUTDOWN
              </button>
            </div>
          </div>
        </div>
      )}

      <ScadaPanel title="MASTER CONTROL" danger={isFiring}>
        <div className="flex flex-col gap-2 p-1">

        {/* Top Row: Indicators */}
        <div className="flex gap-2 min-h-[50px]">
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
        <div className="flex flex-col min-h-[110px]">
           {isCountdown ? (
                <button
                onClick={() => actions.setFireState('ABORT')}
                disabled={!canAbortCountdown}
                className="delight-press flex-1 overflow-hidden bg-scada-warning hover-bg-scada-warning text-scada-inverse font-bold border-4 border-scada-warning rounded flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
               >
                <div className="flex items-baseline gap-2 font-mono leading-none">
                    <span className="text-sm tracking-widest">T-</span>
                    <span className="text-4xl tabular-nums">{countdownRemainingSeconds.toFixed(2)}</span>
                    <span className="text-sm">s</span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xl">
                    <AlertOctagon className="w-8 h-8 delight-icon-shift" />
                    ABORT
                </div>
               </button>
           ) : isFiring ? (
                <button
                onClick={() => actions.setFireState('FIRE_END')}
                disabled={!canEndFire}
                className="delight-press flex-1 bg-scada-warning hover-bg-scada-warning text-scada-inverse font-bold text-2xl border-4 border-scada-warning rounded flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
               >
                <div className="flex items-center gap-2">
                    <AlertOctagon className="w-8 h-8 delight-icon-shift" />
                    END FIRE
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

          {/* Bottom Row: Reset + Shutdown + Test buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => actions.setFireState('FIRE_RESET')}
              disabled={!canReset}
              className="delight-press min-h-11 bg-scada-surface-strong hover-bg-scada-surface-strong text-scada-secondary font-mono text-xs border border-scada-strong rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <button
              onClick={() => actions.setFireState('LAMP_TEST')}
              disabled={!isArmed || !commandsEnabled}
              className="delight-press min-h-11 bg-scada-surface-strong hover-bg-scada-surface-strong text-scada-secondary font-mono text-xs border border-scada-strong rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Lightbulb className="w-3 h-3 delight-icon-shift" /> LAMP TEST
            </button>
            <button
              onClick={() => actions.setFireState('CAMERA_TEST')}
              disabled={!isArmed || !commandsEnabled}
              className="delight-press min-h-11 bg-scada-surface-strong hover-bg-scada-surface-strong text-scada-secondary font-mono text-xs border border-scada-strong rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="w-3 h-3 delight-icon-shift" /> CAMERA TEST
            </button>
          </div>

        </div>
      </ScadaPanel>
    </>
  );
};
