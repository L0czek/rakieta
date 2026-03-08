import React, { useEffect, useState } from 'react';

import { AnalysisView } from './components/AnalysisView';
import { ChecklistView } from './components/ChecklistView';
import { ConfigurationView } from './components/ConfigurationView';
import { DashboardView } from './components/DashboardView';
import { useChecklistEngine } from './hooks/useChecklistEngine';
import { useMqttSystem } from './hooks/useMqttSystem';
import { ConnectionState, MqttConfig } from './types';
import {
  AlertOctagon,
  Beaker,
  LayoutDashboard,
  LineChart as LineChartIcon,
  ListChecks,
  Lock,
  Rocket,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';

type AppView = 'DASHBOARD' | 'ANALYSIS' | 'CHECKLIST' | 'CONFIGURATION';

const MQTT_CONFIG_STORAGE_KEY = 'rocket.mqtt.config';
const DEFAULT_MQTT_PORT = 8000;

const getDefaultMqttConfig = (): MqttConfig => ({
  host: window.location.hostname,
  port: DEFAULT_MQTT_PORT,
  simulation: false,
});

const loadStoredMqttConfig = (): MqttConfig => {
  const defaults = getDefaultMqttConfig();

  try {
    const raw = localStorage.getItem(MQTT_CONFIG_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<MqttConfig>;
    const host = typeof parsed.host === 'string' && parsed.host.trim().length > 0 ? parsed.host : defaults.host;
    const port = typeof parsed.port === 'number' && Number.isFinite(parsed.port) ? parsed.port : defaults.port;
    const username = typeof parsed.username === 'string' ? parsed.username : undefined;
    const password = typeof parsed.password === 'string' ? parsed.password : undefined;

    return {
      ...defaults,
      ...parsed,
      host,
      port,
      username,
      password,
    };
  } catch {
    return defaults;
  }
};

const App = () => {
  const {
    connectionStatus,
    isSimulating,
    criticalError,
    telemetry,
    checklistPointStates,
    connect,
    toggleSimulation,
    publishChecklistPointState,
    resetData,
    actions,
  } = useMqttSystem();

  const [mqttConfig, setMqttConfig] = useState<MqttConfig>(() => loadStoredMqttConfig());
  const [showConfig, setShowConfig] = useState(false);
  const [view, setView] = useState<AppView>('DASHBOARD');
  const [configHasUnsavedChanges, setConfigHasUnsavedChanges] = useState(false);

  const checklistEngine = useChecklistEngine({
    telemetry,
    connectionStatus,
    isSimulating,
    pointStates: checklistPointStates,
    publishChecklistPointState,
  });

  const handleViewChange = (nextView: AppView) => {
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

  const commandsEnabled =
    connectionStatus === ConnectionState.CONNECTED || isSimulating;

  useEffect(() => {
  });

  useEffect(() => {
    try {
      localStorage.setItem(MQTT_CONFIG_STORAGE_KEY, JSON.stringify(mqttConfig));
    } catch {}
  }, [mqttConfig]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-900 flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none z-50 crt-lines opacity-20"></div>

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

      <header className="bg-slate-950 border-b border-slate-800 px-2 py-2 md:px-4 md:py-0 shrink-0 z-10">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 xl:gap-4 md:min-h-14">
          <div className="flex items-center gap-2 min-w-0 md:gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-ping absolute opacity-20"></div>
            <Rocket className="text-cyan-400" />
            <div className="min-w-0">
              <h1 className="text-cyan-400 font-bold tracking-wide text-sm leading-none neon-text whitespace-nowrap md:text-base xl:tracking-widest xl:text-lg">
                ROCKET TEST STAND
              </h1>
              <span className="hidden text-slate-500 text-[10px] tracking-[0.2em] xl:inline">
                TELEMETRY & CONTROL LINK
              </span>
            </div>
          </div>

          <div className="hidden md:block order-3 basis-full xl:order-none xl:basis-auto">
            <div className="flex min-w-max bg-slate-900 rounded border border-slate-700 p-1">
              <button
                onClick={() => handleViewChange('DASHBOARD')}
                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors ${
                  view === 'DASHBOARD' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <LayoutDashboard size={14} /> DASHBOARD
              </button>
              <button
                onClick={() => handleViewChange('ANALYSIS')}
                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors ${
                  view === 'ANALYSIS' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <LineChartIcon size={14} /> ANALYSIS
              </button>
              <button
                onClick={() => handleViewChange('CHECKLIST')}
                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors ${
                  view === 'CHECKLIST' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <ListChecks size={14} /> CHECKLIST
              </button>
              <button
                onClick={() => handleViewChange('CONFIGURATION')}
                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded transition-colors ${
                  view === 'CONFIGURATION' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <SlidersHorizontal size={14} /> CONFIGURATION
              </button>
            </div>
          </div>

          <div className="ml-auto flex items-center justify-end gap-2 md:gap-6">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSimToggle}
                className={`flex min-h-11 items-center gap-2 px-3 py-2 text-xs font-bold rounded transition-colors border md:min-h-0 md:py-1 ${
                  isSimulating
                    ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                <Beaker size={14} /> {isSimulating ? 'STOP SIM' : 'SIM'}
              </button>
              {isSimulating && (
                <button
                  onClick={actions.toggleSimSafety}
                  className={`flex min-h-11 items-center gap-2 px-3 py-2 rounded text-xs font-bold border md:min-h-0 md:py-1 ${
                    telemetry.isUnsafe
                      ? 'bg-red-900/80 border-red-500 text-white'
                      : 'bg-green-900/80 border-green-500 text-white'
                  }`}
                >
                  {telemetry.isUnsafe ? <AlertOctagon size={14} /> : <Lock size={14} />}
                  <span className="inline xl:hidden">SIM: {telemetry.isUnsafe ? 'ARMED' : 'SAFE'}</span>
                  <span className="hidden xl:inline">
                    SIM: {telemetry.isUnsafe ? 'PHYSICAL SWITCH ARMED' : 'PHYSICAL SWITCH SAFE'}
                  </span>
                </button>
              )}
            </div>

            <div className="hidden items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-700 rounded lg:flex">
              <span className="text-xs text-slate-500">AVG FAST ΔT</span>
              <span className="font-mono font-bold text-lg text-slate-200">{telemetry.avgFastAdcPacketLength.toFixed(1)}</span>
            </div>

            <div className="hidden items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-700 rounded lg:flex">
              <span className="text-xs text-slate-500">LAST PACKET</span>
              <span className="font-mono font-bold text-lg text-slate-200">T+{telemetry.lastPacketTimestamp}</span>
            </div>

            <button
              aria-label="Toggle connection config"
              onClick={() => setShowConfig(!showConfig)}
              className="h-11 w-11 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Settings size={20} />
            </button>

            <div
              className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded ${
                connectionStatus === ConnectionState.CONNECTED
                  ? 'bg-green-900/30 text-green-400'
                  : 'bg-red-900/30 text-red-400'
              }`}
            >
              {connectionStatus === ConnectionState.CONNECTED ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="hidden xl:inline">{ConnectionState[connectionStatus]}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-2 pb-16 min-h-0 overflow-auto md:pb-0 md:overflow-hidden relative z-0">
        {showConfig && (
          <div className="absolute inset-0 bg-slate-900/90 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-slate-800 border border-cyan-500/50 p-6 rounded shadow-[0_0_50px_rgba(6,182,212,0.2)] w-full max-w-sm">
              <h2 className="text-cyan-400 font-bold mb-4 text-lg">CONNECTION CONFIG</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">HOST</label>
                  <input
                    type="text"
                    value={mqttConfig.host}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, host: event.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2.5 font-mono
                      outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">PORT (WS)</label>
                  <input
                    type="number"
                    value={mqttConfig.port}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, port: Number(event.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2.5 font-mono
                      outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">USERNAME</label>
                  <input
                    type="text"
                    value={mqttConfig.username ?? ''}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, username: event.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2.5 font-mono
                      outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">PASSWORD</label>
                  <input
                    type="password"
                    value={mqttConfig.password ?? ''}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, password: event.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2.5 font-mono
                      outline-none focus:border-cyan-500"
                  />
                </div>

                <button onClick={handleConnect} className="w-full min-h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 mt-2">
                  CONNECT
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'CHECKLIST' && checklistEngine.isReadOnly && (
          <div
            className="pointer-events-none absolute bottom-16 left-1/2 z-40 w-max max-w-[calc(100%-1rem)]
              -translate-x-1/2 rounded border-2 border-amber-400 bg-amber-900/90 px-4 py-2 text-center
              text-xs font-bold tracking-widest text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.35)]
              md:bottom-4 md:px-6 md:py-3 md:text-sm"
          >
            <div className="flex items-center justify-center gap-2">
              <Lock size={14} />
              <span>READ ONLY SNAPSHOT</span>
            </div>
            <div className="mt-1 text-[10px] tracking-normal text-amber-200 md:text-xs">
              MQTT disconnected and simulator disabled
            </div>
          </div>
        )}

        {view === 'DASHBOARD' ? (
          <DashboardView telemetry={telemetry} actions={actions} commandsEnabled={commandsEnabled} />
        ) : view === 'ANALYSIS' ? (
          <AnalysisView
            telemetry={telemetry}
            actions={actions}
            connectionStatus={connectionStatus}
            isSimulating={isSimulating}
            commandsEnabled={commandsEnabled}
          />
        ) : view === 'CHECKLIST' ? (
          <ChecklistView
            mode={checklistEngine.mode}
            summaries={checklistEngine.summaries}
            selectedChecklistId={checklistEngine.selectedChecklistId}
            onSelectChecklist={checklistEngine.setSelectedChecklistId}
            stepStates={checklistEngine.stepStates}
            activeStep={checklistEngine.activeStep}
            getStepContext={checklistEngine.getStepContext}
            setStepContextField={checklistEngine.setStepContextField}
            onCompleteCurrentStep={checklistEngine.completeStep}
            onResetChecklist={() => checklistEngine.resetChecklist(checklistEngine.selectedChecklistId)}
            onResetAllChecklists={checklistEngine.resetAllChecklists}
            isReadOnly={checklistEngine.isReadOnly}
          />
        ) : (
          <ConfigurationView onDirtyChange={setConfigHasUnsavedChanges} />
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 md:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="grid grid-cols-4 gap-px bg-slate-800">
          <button
            onClick={() => handleViewChange('DASHBOARD')}
            className={`min-h-14 bg-slate-950 px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'DASHBOARD' ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <LayoutDashboard size={16} />
            <span>DASH</span>
          </button>
          <button
            onClick={() => handleViewChange('ANALYSIS')}
            className={`min-h-14 bg-slate-950 px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'ANALYSIS' ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <LineChartIcon size={16} />
            <span>ANALYSIS</span>
          </button>
          <button
            onClick={() => handleViewChange('CHECKLIST')}
            className={`min-h-14 bg-slate-950 px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'CHECKLIST' ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <ListChecks size={16} />
            <span>CHECK</span>
          </button>
          <button
            onClick={() => handleViewChange('CONFIGURATION')}
            className={`min-h-14 bg-slate-950 px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'CONFIGURATION' ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <SlidersHorizontal size={16} />
            <span>CONFIG</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
