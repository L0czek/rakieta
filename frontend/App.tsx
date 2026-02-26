
import React, { useState, useEffect } from 'react';
import { useMqttSystem } from './hooks/useMqttSystem';
import { DashboardView } from './components/DashboardView';
import { AnalysisView } from './components/AnalysisView';
import { ConfigurationView } from './components/ConfigurationView';
import { ConnectionState } from './types';
import { Settings, Wifi, WifiOff, Activity, LayoutDashboard, LineChart as LineChartIcon, Lock, AlertOctagon, ShieldAlert, Trash2, Beaker, SlidersHorizontal } from 'lucide-react';
import { probeCount } from '@/utils/perfProbe';

const App = () => {
  probeCount('render.App');
  const { connectionStatus, isSimulating, criticalError, telemetry, connect, toggleSimulation, resetData, actions } = useMqttSystem();
  
  // Configuration & View State
  const [mqttConfig, setMqttConfig] = useState({ host: 'localhost', port: 8000, simulation: false });
  const [showConfig, setShowConfig] = useState(false);
    const [view, setView] = useState<'DASHBOARD' | 'ANALYSIS' | 'CONFIGURATION'>('DASHBOARD');
    const [configHasUnsavedChanges, setConfigHasUnsavedChanges] = useState(false);

    const handleViewChange = (nextView: 'DASHBOARD' | 'ANALYSIS' | 'CONFIGURATION') => {
        if (view === 'CONFIGURATION' && nextView !== 'CONFIGURATION' && configHasUnsavedChanges) {
            const proceed = window.confirm('You have unsaved configuration changes. Leave without saving?');
            if (!proceed) return;
            setConfigHasUnsavedChanges(false);
        }
        setView(nextView);
    };

  const handleConnect = () => {
    connect(mqttConfig);
    setShowConfig(false);
  };

  const handleSimToggle = () => {
      toggleSimulation(!isSimulating);
  };

  useEffect(() => {
    probeCount('effect.App.commit');
  });

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-900 flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none z-50 crt-lines opacity-20"></div>

      {/* CRITICAL ERROR MODAL */}
      {criticalError && (
          <div className="absolute inset-0 z-[100] bg-red-950/90 backdrop-blur-md flex items-center justify-center p-8">
              <div className="bg-red-900 border-4 border-red-500 rounded-lg p-8 max-w-2xl shadow-[0_0_100px_rgba(220,38,38,0.5)] animate-bounce-short">
                  <div className="flex items-center gap-4 mb-4 text-white">
                      <ShieldAlert size={64} className="animate-pulse" />
                      <div>
                          <h1 className="text-4xl font-bold tracking-widest">CRITICAL FAILURE</h1>
                          <p className="text-xl opacity-80">SAFETY PROTOCOL ENGAGED</p>
                      </div>
                  </div>
                  <div className="bg-black/50 p-4 rounded border border-red-500/50 font-mono text-red-200 mb-6">
                      {criticalError}
                  </div>
                  <div className="flex gap-4">
                      <button 
                        onClick={resetData}
                        className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                      >
                          <Trash2 /> WIPE DATA & RESET
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Header */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center px-4 justify-between shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-ping absolute opacity-20"></div>
          <Activity className="text-cyan-400" />
          <div>
            <h1 className="text-cyan-400 font-bold tracking-widest text-lg leading-none neon-text">ROCKET TEST STAND</h1>
            <span className="text-slate-500 text-[10px] tracking-[0.2em]">TELEMETRY & CONTROL LINK</span>
          </div>
        </div>

        <div className="flex bg-slate-900 rounded border border-slate-700 p-1">
            <button 
                onClick={() => handleViewChange('DASHBOARD')}
                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors ${view === 'DASHBOARD' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
                <LayoutDashboard size={14}/> DASHBOARD
            </button>
            <button 
                onClick={() => handleViewChange('ANALYSIS')}
                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors ${view === 'ANALYSIS' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
                <LineChartIcon size={14}/> ANALYSIS
            </button>
            <button 
                onClick={() => handleViewChange('CONFIGURATION')}
                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors ${view === 'CONFIGURATION' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
                <SlidersHorizontal size={14}/> CONFIGURATION
            </button>
        </div>

        <div className="flex items-center gap-6">
            <button 
             onClick={handleSimToggle}
             className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors border ${isSimulating ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
            >
               <Beaker size={14} /> {isSimulating ? 'STOP SIM' : 'SIMULATOR'}
            </button>

            <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-700 rounded">
                <span className="text-xs text-slate-500">LAST PACKET</span>
                <span className="font-mono font-bold text-lg text-slate-200">
                    T+{telemetry.lastPacketTimestamp}
                </span>
            </div>

            <button onClick={() => setShowConfig(!showConfig)} className="text-slate-400 hover:text-white transition-colors">
                <Settings size={20} />
            </button>
            
            <div className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded ${connectionStatus === ConnectionState.CONNECTED ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {connectionStatus === ConnectionState.CONNECTED ? <Wifi size={14}/> : <WifiOff size={14}/>}
                {ConnectionState[connectionStatus]}
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-2 min-h-0 overflow-hidden relative z-0">
        {/* Settings Modal */}
        {showConfig && (
            <div className="absolute inset-0 bg-slate-900/90 z-50 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-slate-800 border border-cyan-500/50 p-6 rounded shadow-[0_0_50px_rgba(6,182,212,0.2)] w-96">
                    <h2 className="text-cyan-400 font-bold mb-4 text-lg">CONNECTION CONFIG</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">HOST</label>
                            <input type="text" value={mqttConfig.host} onChange={e => setMqttConfig({...mqttConfig, host: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 font-mono outline-none focus:border-cyan-500" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">PORT (WS)</label>
                            <input type="number" value={mqttConfig.port} onChange={e => setMqttConfig({...mqttConfig, port: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 font-mono outline-none focus:border-cyan-500" />
                        </div>

                        <button onClick={handleConnect} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 mt-2">
                            CONNECT
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {/* Simulation Safety Override */}
        {isSimulating && (
             <div className="absolute top-2 left-2 z-50">
                 <button onClick={actions.toggleSimSafety} className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-bold border ${telemetry.isUnsafe ? 'bg-red-900/80 border-red-500 text-white' : 'bg-green-900/80 border-green-500 text-white'}`}>
                    {telemetry.isUnsafe ? <AlertOctagon size={14}/> : <Lock size={14}/>}
                    SIM: {telemetry.isUnsafe ? 'PHYSICAL SWITCH ARMED' : 'PHYSICAL SWITCH SAFE'}
                 </button>
             </div>
        )}

         {view === 'DASHBOARD' ? (
             <DashboardView telemetry={telemetry} actions={actions} />
         ) : view === 'ANALYSIS' ? (
               <AnalysisView telemetry={telemetry} actions={actions} connectionStatus={connectionStatus} isSimulating={isSimulating} />
         ) : (
             <ConfigurationView onDirtyChange={setConfigHasUnsavedChanges} />
        )}

      </main>
    </div>
  );
};

export default App;
