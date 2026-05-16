import React, { Suspense, lazy, useEffect, useState } from 'react';

import { useChecklistEngine } from '@/hooks/useChecklistEngine';
import { useMqttSystem } from '@/hooks/useMqttSystem';
import { ConnectionState, MqttConfig } from '@/types';
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

const DashboardView = lazy(async () => {
  const module = await import('@/components/DashboardView');
  return { default: module.DashboardView };
});

const AnalysisView = lazy(async () => {
  const module = await import('@/components/AnalysisView');
  return { default: module.AnalysisView };
});

const ChecklistView = lazy(async () => {
  const module = await import('@/components/ChecklistView');
  return { default: module.ChecklistView };
});

const ConfigurationView = lazy(async () => {
  const module = await import('@/components/ConfigurationView');
  return { default: module.ConfigurationView };
});

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

const LOADING_VIEW_MESSAGES = [
  'SYNCING TELEMETRY BUS...',
  'VERIFYING CONTROL LINK...',
  'ARMING UI PANELS...',
] as const;

const LoadingFallback: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_VIEW_MESSAGES.length);
    }, 1400);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-scada-secondary">
      <div className="text-sm tracking-wider delight-view-enter">{LOADING_VIEW_MESSAGES[messageIndex]}</div>
      <div className="mt-2 text-[10px] tracking-[0.24em] text-scada-muted">STANDBY</div>
    </div>
  );
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
    publishConversionSettings,
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
  const mobileMainPaddingBottomClass =
    view === 'DASHBOARD'
      ? 'pb-[calc(6.5rem+env(safe-area-inset-bottom)+0.75rem)]'
      : 'pb-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)]';

  useEffect(() => {
    try {
      localStorage.setItem(MQTT_CONFIG_STORAGE_KEY, JSON.stringify(mqttConfig));
    } catch {}
  }, [mqttConfig]);

  const currentView = (() => {
    if (view === 'DASHBOARD') {
      return <DashboardView telemetry={telemetry} actions={actions} commandsEnabled={commandsEnabled} />;
    }
    if (view === 'ANALYSIS') {
      return (
        <AnalysisView
          telemetry={telemetry}
          actions={actions}
          connectionStatus={connectionStatus}
          isSimulating={isSimulating}
          commandsEnabled={commandsEnabled}
        />
      );
    }
    if (view === 'CHECKLIST') {
      return (
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
      );
    }
    return (
      <ConfigurationView
        onDirtyChange={setConfigHasUnsavedChanges}
        telemetry={telemetry}
        publishConversionSettings={publishConversionSettings}
      />
    );
  })();

  return (
    <div className="w-screen h-screen overflow-hidden bg-scada-app flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none z-50 crt-lines opacity-20"></div>

      {criticalError && (
        <div className="absolute inset-0 z-[100] bg-scada-danger-overlay backdrop-blur-md flex items-center justify-center p-8">
          <div className="bg-scada-danger-strong border-4 border-scada-danger rounded-lg p-8 max-w-2xl shadow-scada-danger-xl">
            <div className="flex items-center gap-4 mb-4 text-scada-inverse">
              <ShieldAlert size={64} className="animate-pulse" />
              <div>
                <h1 className="text-4xl font-bold tracking-widest">CRITICAL FAILURE</h1>
                <p className="text-xl opacity-80">SAFETY PROTOCOL ENGAGED</p>
              </div>
            </div>
            <div className="bg-scada-surface-soft p-4 rounded border border-scada-danger font-mono text-scada-danger-soft mb-6">
              {criticalError}
            </div>
            <div className="flex gap-4">
              <button
                onClick={resetData}
                className="delight-press flex-1 py-4 bg-scada-danger hover-bg-scada-danger-strong text-scada-inverse font-bold rounded text-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="delight-icon-shift" /> WIPE DATA & RESET
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-scada-app border-b border-scada-weak px-2 py-2 md:px-4 md:py-0 shrink-0 z-10">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 xl:gap-4 md:min-h-14">
          <div className="flex items-center gap-2 min-w-0 md:gap-3">
            <div className="w-3 h-3 bg-scada-danger-strong rounded-full absolute opacity-20"></div>
            <Rocket className="text-scada-accent" />
            <div className="min-w-0">
              <h1 className="text-scada-accent font-bold tracking-wide text-sm leading-none whitespace-nowrap md:text-base xl:tracking-widest xl:text-lg">
                ROCKET TEST STAND
              </h1>
              <span className="hidden text-scada-muted text-[10px] tracking-[0.2em] xl:inline">
                TELEMETRY & CONTROL LINK
              </span>
            </div>
          </div>

          <div className="hidden md:block order-3 basis-full xl:order-none xl:basis-auto">
            <div className="flex min-w-max bg-scada-surface rounded border border-scada p-1">
              <button
                onClick={() => handleViewChange('DASHBOARD')}
                className={`delight-press flex min-h-11 items-center gap-2 px-3 py-2 text-xs font-bold rounded transition-colors lg:min-h-0 lg:py-1 ${
                  view === 'DASHBOARD' ? 'bg-scada-accent-soft text-scada-accent' : 'text-scada-muted hover-text-scada-secondary'
                }`}
              >
                <LayoutDashboard size={14} className="delight-icon-shift" /> DASHBOARD
              </button>
              <button
                onClick={() => handleViewChange('ANALYSIS')}
                className={`delight-press flex min-h-11 items-center gap-2 px-3 py-2 text-xs font-bold rounded transition-colors lg:min-h-0 lg:py-1 ${
                  view === 'ANALYSIS' ? 'bg-scada-accent-soft text-scada-accent' : 'text-scada-muted hover-text-scada-secondary'
                }`}
              >
                <LineChartIcon size={14} className="delight-icon-shift" /> ANALYSIS
              </button>
              <button
                onClick={() => handleViewChange('CHECKLIST')}
                className={`delight-press flex min-h-11 items-center gap-2 px-3 py-2 text-xs font-bold rounded transition-colors lg:min-h-0 lg:py-1 ${
                  view === 'CHECKLIST' ? 'bg-scada-accent-soft text-scada-accent' : 'text-scada-muted hover-text-scada-secondary'
                }`}
              >
                <ListChecks size={14} className="delight-icon-shift" /> CHECKLIST
              </button>
              <button
                onClick={() => handleViewChange('CONFIGURATION')}
                className={`delight-press flex min-h-11 items-center gap-2 px-3 py-2 text-xs font-bold rounded transition-colors lg:min-h-0 lg:py-1 ${
                  view === 'CONFIGURATION' ? 'bg-scada-accent-soft text-scada-accent' : 'text-scada-muted hover-text-scada-secondary'
                }`}
              >
                <SlidersHorizontal size={14} className="delight-icon-shift" /> CONFIGURATION
              </button>
            </div>
          </div>

          <div className="ml-auto flex items-center justify-end gap-2 md:gap-6">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSimToggle}
                className={`delight-press flex min-h-11 items-center gap-2 px-3 py-2 text-xs font-bold rounded transition-colors border lg:min-h-0 lg:py-1 ${
                  isSimulating
                    ? 'bg-scada-accent-soft border-scada-accent text-scada-accent'
                    : 'border-scada text-scada-muted hover-text-scada-secondary'
                }`}
              >
                <Beaker size={14} className="delight-icon-shift" /> {isSimulating ? 'STOP SIM' : 'SIM'}
              </button>
              {isSimulating && (
                <button
                  onClick={actions.toggleSimSafety}
                  className={`delight-press flex min-h-11 items-center gap-2 px-3 py-2 rounded text-xs font-bold border lg:min-h-0 lg:py-1 ${
                    telemetry.isUnsafe
                      ? 'bg-scada-danger-strong border-scada-danger text-scada-inverse'
                      : 'bg-scada-success-strong border-scada-success text-scada-inverse'
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

            <div className="hidden items-center gap-2 px-3 py-1 bg-scada-surface border border-scada rounded lg:flex">
              <span className="text-xs text-scada-muted">AVG FAST ΔT</span>
              <span className="font-mono font-bold text-lg text-scada-secondary">{telemetry.avgFastAdcPacketLength.toFixed(1)}</span>
            </div>

            <div className="hidden items-center gap-2 px-3 py-1 bg-scada-surface border border-scada rounded lg:flex">
              <span className="text-xs text-scada-muted">LAST PACKET</span>
              <span className="font-mono font-bold text-lg text-scada-secondary">T+{telemetry.lastPacketTimestamp}</span>
            </div>

            <button
              aria-label="Toggle connection config"
              onClick={() => setShowConfig(!showConfig)}
              className="delight-press h-11 w-11 flex items-center justify-center rounded text-scada-secondary hover-text-scada-inverse hover-bg-scada-surface-elevated transition-colors"
            >
              <Settings size={20} className="delight-icon-shift" />
            </button>

            <div
              className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded ${
                connectionStatus === ConnectionState.CONNECTED
                  ? 'bg-scada-success-soft text-scada-success-soft'
                  : 'bg-scada-danger-soft text-scada-danger-soft'
              }`}
            >
              {connectionStatus === ConnectionState.CONNECTED ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="hidden xl:inline">{ConnectionState[connectionStatus]}</span>
            </div>
          </div>
        </div>
      </header>

      <main className={`flex-1 p-2 ${mobileMainPaddingBottomClass} min-h-0 overflow-auto md:pb-0 md:overflow-hidden relative z-0`}>
        {showConfig && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-scada-overlay backdrop-blur-sm">
            <div className="bg-scada-surface-elevated border border-scada-accent p-6 rounded shadow-scada-accent-md w-full max-w-sm">
              <h2 className="text-scada-accent font-bold mb-4 text-lg">CONNECTION CONFIG</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-scada-secondary block mb-1">HOST</label>
                  <input
                    type="text"
                    value={mqttConfig.host}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, host: event.target.value })}
                    className="scada-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-scada-secondary block mb-1">PORT (WS)</label>
                  <input
                    type="number"
                    value={mqttConfig.port}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, port: Number(event.target.value) })}
                    className="scada-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-scada-secondary block mb-1">USERNAME</label>
                  <input
                    type="text"
                    value={mqttConfig.username ?? ''}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, username: event.target.value })}
                    className="scada-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-scada-secondary block mb-1">PASSWORD</label>
                  <input
                    type="password"
                    value={mqttConfig.password ?? ''}
                    onChange={(event) => setMqttConfig({ ...mqttConfig, password: event.target.value })}
                    className="scada-input"
                  />
                </div>

                <button onClick={handleConnect} className="delight-press w-full min-h-11 bg-scada-accent hover-bg-scada-accent text-scada-inverse font-bold py-2 mt-2">
                  CONNECT
                </button>
              </div>
            </div>
          </div>
        )}

        {checklistEngine.isReadOnly && (
          <div
            className="pointer-events-none fixed left-1/2 top-[calc(3.75rem+env(safe-area-inset-top)+0.25rem)] z-40 w-max max-w-[calc(100%-1rem)]
              -translate-x-1/2 rounded border-2 border-scada-warning bg-scada-warning-strong px-4 py-2 text-center
              text-xs font-bold tracking-widest text-scada-warning-soft shadow-scada-warning-md md:px-6 md:py-3 md:text-sm"
          >
            <div className="flex items-center justify-center gap-2">
              <Lock size={14} />
              <span>READ ONLY SNAPSHOT</span>
            </div>
            <div className="mt-1 text-[10px] tracking-normal text-scada-warning-soft md:text-xs">
              MQTT disconnected and simulator disabled
            </div>
          </div>
        )}

        <Suspense fallback={<LoadingFallback />}>
          <div key={view} className="h-full delight-view-enter">
            {currentView}
          </div>
        </Suspense>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 md:hidden border-t border-scada-weak bg-scada-app-soft">
        <div className="grid grid-cols-4 gap-px bg-scada-surface-elevated">
          <button
            onClick={() => handleViewChange('DASHBOARD')}
            className={`delight-press min-h-14 bg-scada-app px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'DASHBOARD' ? 'text-scada-accent' : 'text-scada-muted'
            }`}
          >
            <LayoutDashboard size={16} className="delight-icon-shift" />
            <span>DASH</span>
          </button>
          <button
            onClick={() => handleViewChange('ANALYSIS')}
            className={`delight-press min-h-14 bg-scada-app px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'ANALYSIS' ? 'text-scada-accent' : 'text-scada-muted'
            }`}
          >
            <LineChartIcon size={16} className="delight-icon-shift" />
            <span>ANALYSIS</span>
          </button>
          <button
            onClick={() => handleViewChange('CHECKLIST')}
            className={`delight-press min-h-14 bg-scada-app px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'CHECKLIST' ? 'text-scada-accent' : 'text-scada-muted'
            }`}
          >
            <ListChecks size={16} className="delight-icon-shift" />
            <span>CHECK</span>
          </button>
          <button
            onClick={() => handleViewChange('CONFIGURATION')}
            className={`delight-press min-h-14 bg-scada-app px-2 py-1 flex flex-col items-center justify-center text-[10px] font-bold tracking-wide ${
              view === 'CONFIGURATION' ? 'text-scada-accent' : 'text-scada-muted'
            }`}
          >
            <SlidersHorizontal size={16} className="delight-icon-shift" />
            <span>CONFIG</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
