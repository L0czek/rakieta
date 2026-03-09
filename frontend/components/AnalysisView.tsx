
import React, { useState, useEffect, useRef } from 'react';
import { SystemTelemetry, SensorDataPoint } from '@/types';
import { ScadaPanel, ValueDisplay, SENSOR_COLORS, TEMP_COLORS, useChartSize, CHART_RANGES } from '@/components/Widgets';
import { ControlPanel } from '@/components/ControlPanel';
import { ServoPanel } from '@/components/ServoPanel';
import { Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import * as DB from '@/utils/db';
import { ConnectionState } from '@/types';
import { CHART_COLORS } from '@/theme/tokens';

interface AnalysisViewProps {
    telemetry: SystemTelemetry;
    actions: any;
        connectionStatus: ConnectionState;
        isSimulating: boolean;
        commandsEnabled: boolean;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({
    telemetry,
    actions,
    connectionStatus,
    isSimulating,
    commandsEnabled,
}) => {
    const sensorLabels: Record<string, string> = {
        tensometer: 'tensometer',
        pressureTank: 'tank pressure',
        pressureCombustion: 'comb chamber pressure',
        batteryStand: 'test stand battery',
        batteryComputer: 'mainboard battery',
        boostVoltage: 'boost voltage',
        starterSense: 'starter sense',
    };
    const getSeriesLabel = (key: string) => sensorLabels[key] || (knownSensors.includes(key) ? `temp ${key}` : key);

  // View State
    const [isLive, setIsLive] = useState(() => connectionStatus === ConnectionState.CONNECTED || isSimulating);
  const [windowSize, setWindowSize] = useState(30000); // 30 seconds default
  const [viewStart, setViewStart] = useState(0); 
  const [chartData, setChartData] = useState<Record<string, SensorDataPoint[]> | null>(null);

  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({
    tensometer: true,
    pressureTank: true,
    pressureCombustion: true,
    batteryStand: false,
    batteryComputer: false,
    boostVoltage: false,
    starterSense: false,
    servo: false
  });

  // Dynamic sensors
  const [knownSensors, setKnownSensors] = useState<string[]>([]);

  useEffect(() => {
     const loadKnownSensors = async () => {
         try {
             const sensorIds = await DB.getSensorIds();
             const baseSensors = new Set([
                 'tensometer',
                 'pressureTank',
                 'pressureCombustion',
                 'batteryStand',
                 'batteryComputer',
                 'starterSense',
                 'boostVoltage',
                 'servo'
             ]);
             const tempSensors = sensorIds.filter(id => !baseSensors.has(id));
             setKnownSensors(prev => {
                 const combined = Array.from(new Set([...prev, ...tempSensors]));
                 if (combined.length !== prev.length) return combined;
                 return prev;
             });
         } catch (error) {
             console.error('Failed to load known sensors', error);
         }
     };

     void loadKnownSensors();
  }, []);

  useEffect(() => {
     const temps = Object.keys(telemetry.temperatures);
     setKnownSensors(prev => {
         const combined = Array.from(new Set([...prev, ...temps]));
         if (combined.length !== prev.length) return combined;
         return prev;
     });
  }, [telemetry.temperatures]);

  useEffect(() => {
      setVisibleLines(prev => {
          const next = { ...prev };
          let changed = false;
          knownSensors.forEach(s => {
              if (next[s] === undefined) {
                  next[s] = false;
                  changed = true;
              }
          });
          return changed ? next : prev;
      });
  }, [knownSensors]);

  const toggleLine = (key: string) => setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }));

  // --- DATABASE FETCHING LOGIC (DEBOUNCED QUEUE) ---
  const fetchState = useRef<{
      isFetching: boolean;
      pending: { start: number; end: number; keys: string[] } | null;
  }>({ isFetching: false, pending: null });
  
  const isMountedRef = useRef(true);
  useEffect(() => {
      isMountedRef.current = true;
      return () => { isMountedRef.current = false; };
  }, []);

  const performFetch = async (start: number, end: number, keys: string[]) => {
      const dataMap: Record<string, SensorDataPoint[]> = {};
      const dbKeyMap: Record<string, string> = {
          tensometer: 'tensometer', pressureTank: 'pressureTank', pressureCombustion: 'pressureCombustion',
          batteryStand: 'batteryStand', batteryComputer: 'batteryComputer', starterSense: 'starterSense', 
          boostVoltage: 'boostVoltage', servo: 'servo'
      };

      await Promise.all(keys.map(async (uiKey) => {
          const dbKey = dbKeyMap[uiKey] || uiKey;
          const pts = await DB.getMeasurementsInRange(dbKey, start, end);
          dataMap[uiKey] = pts;
      }));
      return dataMap;
  };

  const processQueue = () => {
      if (!isMountedRef.current) return;
      
      const next = fetchState.current.pending;
      if (!next) {
          fetchState.current.isFetching = false;
          return;
      }

      // Consume the pending request
      fetchState.current.pending = null; 
      // Note: isFetching is already true here

      performFetch(next.start, next.end, next.keys).then(data => {
          if (isMountedRef.current) {
              setChartData(data);
          }
      }).finally(() => {
          // Wait 200ms before processing next item to debounce database hits
           setTimeout(() => {
              if (isMountedRef.current) processQueue();
           }, 200);
      });
  };

  const requestFetch = (start: number, end: number, keys: string[]) => {
      if (fetchState.current.isFetching) {
          // If fetching (or in cooldown), replace pending with this new request
          fetchState.current.pending = { start, end, keys };
      } else {
          // Start immediately
          fetchState.current.isFetching = true;
          performFetch(start, end, keys).then(data => {
              if (isMountedRef.current) {
                  setChartData(data);
              }
          }).finally(() => {
              // Wait 200ms before checking queue
              setTimeout(() => {
                  if (isMountedRef.current) processQueue();
              }, 200);
          });
      }
  };

  // --- EFFECT TRIGGERS ---

  // 1. Live Mode: Auto-scroll
  useEffect(() => {
      if (isLive) {
          const now = telemetry.lastPacketTimestamp;
          const start = Math.max(telemetry.startTime, now - windowSize);
          setViewStart(start);
      }
  }, [telemetry.lastPacketTimestamp, isLive, windowSize, telemetry.startTime]);

  // 2. History Mode Trigger
  useEffect(() => {
      if (!isLive) {
           const activeKeys = Object.keys(visibleLines).filter(k => visibleLines[k]);
           if (activeKeys.length > 0) {
               requestFetch(viewStart, viewStart + windowSize, activeKeys);
           }
      }
  }, [viewStart, windowSize, isLive, visibleLines]);

  // --- HELPERS ---

  const getLatestValue = (data: {value: number}[]) => data.length > 0 ? data[data.length - 1].value : 0;
  
  const vals = {
    tank: getLatestValue(telemetry.pressureTank).toFixed(1),
    combustion: getLatestValue(telemetry.pressureCombustion).toFixed(1),
    thrust: getLatestValue(telemetry.tensometer).toFixed(1),
        batStand: getLatestValue(telemetry.batteryStand).toFixed(2),
        batComp: getLatestValue(telemetry.batteryComputer).toFixed(2),
        boost: getLatestValue(telemetry.boostVoltage).toFixed(2),
        starter: getLatestValue(telemetry.starterSense).toFixed(2)
  };
    const servoPositionDegrees = getLatestValue(telemetry.servoPosition);
    const latestTemperatures = Object.entries(telemetry.temperatures as Record<string, { value: number }[]>)
        .map(([id, points]) => ({ id, value: getLatestValue(points) }));

  const liveSeriesData = React.useMemo(() => {
      if (!isLive) return {};

      const rawSeries: Record<string, SensorDataPoint[]> = {
          tensometer: telemetry.tensometer,
          pressureTank: telemetry.pressureTank,
          pressureCombustion: telemetry.pressureCombustion,
          batteryStand: telemetry.batteryStand,
          batteryComputer: telemetry.batteryComputer,
          boostVoltage: telemetry.boostVoltage,
          starterSense: telemetry.starterSense,
          servo: telemetry.servoPosition,
          ...telemetry.temperatures,
      };

      const next: Record<string, SensorDataPoint[]> = {};
      for (const [key, visible] of Object.entries(visibleLines)) {
          if (!visible) continue;
          const raw = rawSeries[key] || [];
          next[key] = raw;
      }
      return next;
  }, [
    isLive,
    visibleLines,
    telemetry.tensometer,
    telemetry.pressureTank,
    telemetry.pressureCombustion,
        telemetry.batteryStand,
        telemetry.batteryComputer,
        telemetry.boostVoltage,
        telemetry.starterSense,
        telemetry.servoPosition,
        telemetry.temperatures,
  ]);

  const historySeriesData = React.useMemo(() => {
      if (isLive || !chartData) return {};
      const next: Record<string, SensorDataPoint[]> = {};
      for (const [key, visible] of Object.entries(visibleLines)) {
          if (!visible) continue;
          const raw = chartData[key] || [];
          next[key] = raw;
      }
      return next;
  }, [isLive, chartData, visibleLines]);

  const displayedSeriesData = isLive ? liveSeriesData : historySeriesData;

  const handleScroll = (e: React.ChangeEvent<HTMLInputElement>) => {
      setViewStart(Number(e.target.value));
      setIsLive(false);
  };

  const handleZoom = (direction: 'in' | 'out') => {
      setWindowSize(prev => {
          const next = direction === 'in' ? prev / 2 : prev * 2;
          return Math.max(1000, Math.min(next, 600000));
      });
  };

  // Visibility flags for axes
  const showAxisPressure = visibleLines.pressureTank || visibleLines.pressureCombustion;
  const showAxisVoltage = visibleLines.batteryStand || visibleLines.batteryComputer || visibleLines.boostVoltage;
  const showAxisTemp = knownSensors.some(k => visibleLines[k]);

  const { ref: chartRef, size: chartSize } = useChartSize();

  const seriesMeta = React.useMemo(() => {
      const next: Array<{ key: string; label: string; color: string; scale: string }> = [];

      if (visibleLines.tensometer) {
          next.push({ key: 'tensometer', label: getSeriesLabel('tensometer'), color: SENSOR_COLORS.tensometer, scale: 'thrust' });
      }
      if (visibleLines.pressureTank) {
          next.push({ key: 'pressureTank', label: getSeriesLabel('pressureTank'), color: SENSOR_COLORS.pressureTank, scale: 'pressure' });
      }
      if (visibleLines.pressureCombustion) {
          next.push({ key: 'pressureCombustion', label: getSeriesLabel('pressureCombustion'), color: SENSOR_COLORS.pressureCombustion, scale: 'pressure' });
      }
      if (visibleLines.batteryStand) {
          next.push({ key: 'batteryStand', label: getSeriesLabel('batteryStand'), color: SENSOR_COLORS.batteryStand, scale: 'voltage' });
      }
      if (visibleLines.batteryComputer) {
          next.push({ key: 'batteryComputer', label: getSeriesLabel('batteryComputer'), color: SENSOR_COLORS.batteryComputer, scale: 'voltage' });
      }
      if (visibleLines.boostVoltage) {
          next.push({ key: 'boostVoltage', label: getSeriesLabel('boostVoltage'), color: SENSOR_COLORS.boostVoltage, scale: 'voltage' });
      }
      if (visibleLines.starterSense) {
          next.push({ key: 'starterSense', label: getSeriesLabel('starterSense'), color: SENSOR_COLORS.starterSense, scale: 'starter' });
      }
      if (visibleLines.servo) {
          next.push({ key: 'servo', label: 'Servo', color: SENSOR_COLORS.servo, scale: 'servo' });
      }

      knownSensors.forEach((key, idx) => {
          if (!visibleLines[key]) return;
          next.push({ key, label: getSeriesLabel(key), color: TEMP_COLORS[idx % TEMP_COLORS.length], scale: 'temp' });
      });

      return next;
  }, [visibleLines, knownSensors]);

  const alignedData = React.useMemo(() => {
      if (seriesMeta.length === 0) return [[]];

      const windowStart = viewStart;
      const windowEnd = viewStart + windowSize;
      const timestampSet = new Set<number>();

      for (const meta of seriesMeta) {
          const points = displayedSeriesData[meta.key] || [];
          for (const point of points) {
              if (point.timestamp < windowStart || point.timestamp > windowEnd) continue;
              timestampSet.add(point.timestamp);
          }
      }

      const xVals = Array.from(timestampSet).sort((a, b) => a - b);
      if (xVals.length === 0) return [[], ...seriesMeta.map(() => [])];

      const indexByTimestamp = new Map<number, number>();
      xVals.forEach((ts, idx) => indexByTimestamp.set(ts, idx));

      const seriesValues = seriesMeta.map(() => new Array<number | null>(xVals.length).fill(null));
      seriesMeta.forEach((meta, metaIndex) => {
          const points = displayedSeriesData[meta.key] || [];
          for (const point of points) {
              if (point.timestamp < windowStart || point.timestamp > windowEnd) continue;
              const idx = indexByTimestamp.get(point.timestamp);
              if (idx === undefined) continue;
              seriesValues[metaIndex][idx] = point.value;
          }
      });

      return [xVals, ...seriesValues];
  }, [displayedSeriesData, seriesMeta, viewStart, windowSize]);

  const axes = React.useMemo<uPlot.Axis[]>(() => {
      return [
          {
              stroke: CHART_COLORS.axis,
              grid: { stroke: CHART_COLORS.grid },
              ticks: { stroke: CHART_COLORS.grid },
              values: (_u, ticks) => ticks.map((val) => `${(val / 1000).toFixed(0)}s`),
          },
          { scale: 'thrust', side: 3, stroke: SENSOR_COLORS.tensometer, show: visibleLines.tensometer, label: 'kg' },
          { scale: 'pressure', side: 3, stroke: SENSOR_COLORS.pressureTank, show: showAxisPressure, label: 'bar' },
          { scale: 'voltage', side: 1, stroke: SENSOR_COLORS.batteryStand, show: showAxisVoltage, label: 'V' },
          { scale: 'starter', side: 1, stroke: SENSOR_COLORS.starterSense, show: visibleLines.starterSense, label: 'V(S)' },
          { scale: 'servo', side: 1, stroke: SENSOR_COLORS.servo, show: visibleLines.servo, label: '°' },
          { scale: 'temp', side: 1, stroke: TEMP_COLORS[0], show: showAxisTemp, label: '°C' },
      ];
  }, [showAxisPressure, showAxisTemp, showAxisVoltage, visibleLines]);

  const chartOptions = React.useMemo<uPlot.Options>(() => {
      return {
          width: chartSize.width,
          height: chartSize.height,
          scales: {
              x: { time: false, range: () => [viewStart, viewStart + windowSize] },
              thrust: { range: () => CHART_RANGES.thrust },
              pressure: { range: () => CHART_RANGES.pressure },
              voltage: { range: () => CHART_RANGES.voltage },
              starter: { range: () => CHART_RANGES.starter },
              servo: { range: () => CHART_RANGES.servo },
              temp: { range: () => CHART_RANGES.temp },
          },
          axes,
          series: [
              { label: 'T' },
              ...seriesMeta.map((meta) => ({
                  label: meta.label,
                  scale: meta.scale,
                  stroke: meta.color,
                  width: 2,
                  points: { show: false },
                  spanGaps: true,
              })),
          ],
          legend: { show: true },
          cursor: {
              drag: { x: false, y: true, uni: Infinity },
              hover: {
                  prox: (self, seriesIdx, hoveredIdx) => {
                      const yVal = self.data[seriesIdx]?.[hoveredIdx];
                      if (yVal === null) {
                          return 15;
                      }
                      return null;
                  },
                  skip: [null],
              },
          },
      };
  }, [axes, chartSize.width, chartSize.height, seriesMeta, viewStart, windowSize]);

  const handleChartCreate = React.useCallback((chart: uPlot) => {
      const legend = chart.root.querySelector<HTMLDivElement>('.u-legend');
      if (!legend) return;
      legend.style.position = 'absolute';
      legend.style.top = '0';
      legend.style.left = '0';
      legend.style.right = '0';
      legend.style.zIndex = '2';
      legend.style.pointerEvents = 'none';
      legend.style.margin = '0';
  }, []);

  return (
    <div className="grid grid-cols-1 gap-2 auto-rows-[minmax(220px,auto)] min-h-full lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:grid-rows-[minmax(0,1fr)_360px]">
        {/* Top-Left: Big Chart (Rows 1-8, Cols 1-9) */}
        <div className="order-1 min-h-[320px] lg:order-none lg:col-start-1 lg:row-start-1 lg:min-h-0">
            <ScadaPanel title="ANALYSIS" className="h-full">
            <div ref={chartRef} className="w-full h-full relative overflow-hidden">
                {chartSize.width > 0 && chartSize.height > 0 && seriesMeta.length > 0 ? (
                    <UplotReact options={chartOptions} data={alignedData} resetScales={false} onCreate={handleChartCreate} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-scada-muted text-xs">NO DATA</div>
                )}
            </div>
            </ScadaPanel>
        </div>

        {/* Top-Right: Current Values (Rows 1-8, Cols 10-12) */}
        <div className="order-3 hidden flex-col gap-2 md:flex lg:order-none lg:col-start-2 lg:row-start-1 lg:min-h-0">
            <ScadaPanel title="LIVE VALUES" className="flex-1">
                <div className="p-2 space-y-1 overflow-y-auto h-full pr-1 scrollbar-thin">
                    {/* Primary */}
                    <ValueDisplay label={getSeriesLabel('tensometer')} value={vals.thrust} unit=" KG" color="text-scada-series-violet" />
                    <ValueDisplay label={getSeriesLabel('pressureTank')} value={vals.tank} unit=" BAR" color="text-scada-accent" />
                    <ValueDisplay label={getSeriesLabel('pressureCombustion')} value={vals.combustion} unit=" BAR" color="text-scada-series-orange" />
                    
                    <div className="my-2 border-t border-scada-soft"></div>
                    
                    {/* Power */}
                    <ValueDisplay label={getSeriesLabel('batteryStand')} value={vals.batStand} unit=" V" color="text-scada-success" />
                    <ValueDisplay label={getSeriesLabel('batteryComputer')} value={vals.batComp} unit=" V" color="text-scada-success" />
                    <ValueDisplay label={getSeriesLabel('boostVoltage')} value={vals.boost} unit=" V" color="text-scada-warning" />
                    <ValueDisplay label={getSeriesLabel('starterSense')} value={vals.starter} unit=" V" color="text-scada-series-violet" />

                    <div className="my-2 border-t border-scada-soft"></div>

                    {/* Thermal */}
                    {latestTemperatures.map(({ id, value: temp }) => (
                        <ValueDisplay key={id} label={getSeriesLabel(id)} value={temp.toFixed(1)} unit=" °C" color="text-scada-series-temp" />
                    ))}
                    {latestTemperatures.length === 0 && <div className="text-[10px] text-scada-muted text-center py-2">NO THERMAL DATA</div>}
                </div>
            </ScadaPanel>
            <ScadaPanel title="STATUS LOG" className="h-40 md:h-32">
                                <div className="font-mono text-xs p-2 h-full overflow-y-auto pr-1 scrollbar-thin space-y-1">
                                        {(telemetry.statusLog.length > 0
                                            ? telemetry.statusLog
                                            : [{ message: 'System Ready.', receivedAt: 0, type: 'status' as const }]
                                        )
                                            .slice()
                                            .reverse()
                                            .map((entry, index) => (
                                                <div
                                                  key={`${entry.receivedAt}-${index}`}
                                                  className={`break-all ${entry.type === 'connection' ? 'text-scada-accent-soft' : 'text-scada-warning-soft'}`}
                                                >
                                                        <span className="text-scada-muted">[{new Date(entry.receivedAt).toLocaleString()}]</span>{' '}
                                                        &gt; {entry.message}
                                                </div>
                                            ))}
                                </div>
            </ScadaPanel>
        </div>

        {/* Bottom-Left: Data Controls & Navigation (Rows 9-12, Cols 10-12) */}
        <div className="order-2 lg:order-none lg:col-start-1 lg:row-start-2">
        <ScadaPanel title="DATA CONTROL" className="h-full">
            <div className="flex flex-col h-full p-2 gap-2">
                {/* Series Toggles */}
                <div className="flex flex-wrap gap-2">
                    {Object.entries(visibleLines).map(([key, active]) => (
                        <button key={key} onClick={() => toggleLine(key)} className={`delight-press px-3 py-2 min-h-11 border rounded text-[10px] font-bold uppercase flex items-center gap-2 lg:min-h-0 lg:px-2 lg:py-1 ${active ? 'bg-scada-surface-strong text-scada-inverse border-scada-strong' : 'bg-scada-surface text-scada-muted border-scada-weak'}`}>
                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: SENSOR_COLORS[key] || TEMP_COLORS[0]}}></div>
                            {getSeriesLabel(key)}
                        </button>
                    ))}
                </div>
                
                {/* Navigation Bar */}
                <div className="mt-auto bg-scada-surface-soft p-2 rounded border border-scada flex flex-col gap-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                            <button 
                            onClick={() => setIsLive(!isLive)} 
                            className={`delight-press flex min-h-11 items-center justify-center gap-2 px-3 py-2 rounded text-xs font-bold border shadow-lg lg:min-h-0 lg:py-1 ${isLive ? 'bg-scada-accent-strong border-scada-accent text-scada-accent' : 'bg-scada-surface-soft-strong border-scada-strong text-scada-secondary'}`}
                            >
                            {isLive ? <Pause size={14} fill="currentColor" className="delight-icon-shift"/> : <Play size={14} fill="currentColor" className="delight-icon-shift"/>}
                            {isLive ? 'LIVE' : 'PAUSED'}
                            </button>

                            <div className="hidden h-6 w-px bg-scada-surface-strong md:block"></div>

                            <div className="flex items-center gap-1">
                                <button aria-label="Zoom in analysis window" onClick={() => handleZoom('in')} className="delight-press h-11 w-11 flex items-center justify-center hover-bg-scada-surface-strong rounded lg:h-8 lg:w-8"><ZoomIn size={16} className="text-scada-secondary delight-icon-shift"/></button>
                                <button aria-label="Zoom out analysis window" onClick={() => handleZoom('out')} className="delight-press h-11 w-11 flex items-center justify-center hover-bg-scada-surface-strong rounded lg:h-8 lg:w-8"><ZoomOut size={16} className="text-scada-secondary delight-icon-shift"/></button>
                                <span className="text-xs font-mono text-scada-muted ml-2">WINDOW: {(windowSize/1000).toFixed(1)}s</span>
                            </div>
                            
                            <div className="text-xs font-mono text-scada-muted md:ml-auto">
                                CURSOR: T+{viewStart}
                            </div>
                        </div>

                        {/* History Scrollbar */}
                        <div className="relative h-11 w-full flex items-center">
                            <input 
                            type="range" 
                            min={telemetry.startTime} 
                            max={Math.max(telemetry.startTime, telemetry.lastPacketTimestamp - windowSize)} 
                            value={viewStart} 
                            onChange={handleScroll}
                            disabled={isLive}
                            className="w-full h-11 bg-scada-surface-soft-strong rounded-lg appearance-none cursor-pointer accent-scada disabled:opacity-50"
                            />
                        </div>
                </div>
            </div>
        </ScadaPanel>
        </div>

        {/* Bottom-Right: Master Control & Servo (Rows 9-12, Cols 10-12) */}
        <div className="order-4 hidden gap-2 md:grid lg:order-none lg:col-start-2 lg:row-start-2 lg:grid-rows-[120px_minmax(0,1fr)]">
            <div className="min-h-[120px] lg:min-h-0">
                <ServoPanel 
                    servoPositionDegrees={servoPositionDegrees} 
                    servoState={telemetry.servoState}
                    systemState={telemetry.state}
                    actions={actions}
                    commandsEnabled={commandsEnabled}
                />
            </div>
            <div className="min-h-[220px] lg:min-h-0">
                <ControlPanel 
                    systemState={telemetry.state} 
                    isUnsafe={telemetry.isUnsafe} 
                    actions={actions}
                    commandsEnabled={commandsEnabled}
                />
            </div>
        </div>
    </div>
  );
};
