
import React, { useState, useEffect, useRef } from 'react';
import { SystemTelemetry, SensorDataPoint } from '../types';
import { ScadaPanel, ValueDisplay, SENSOR_COLORS, TEMP_COLORS } from './Widgets';
import { ControlPanel } from './ControlPanel';
import { ServoPanel } from './ServoPanel';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import * as DB from '../utils/db';
import { downsampleMinMax, MAX_RENDER_POINTS } from '@/utils/downsampling';
import { probeCount, probeDuration } from '@/utils/perfProbe';

interface AnalysisViewProps {
    telemetry: SystemTelemetry;
    actions: any;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ telemetry, actions }) => {
  probeCount('render.AnalysisView');
  // View State
  const [isLive, setIsLive] = useState(true);
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

  useEffect(() => {
      probeCount('effect.AnalysisView.commit');
  });

  // --- HELPERS ---

  const getLatestValue = (data: {value: number}[]) => data.length > 0 ? data[data.length - 1].value : 0;
  
  const vals = {
    tank: getLatestValue(telemetry.pressureTank).toFixed(1),
    combustion: getLatestValue(telemetry.pressureCombustion).toFixed(1),
    thrust: getLatestValue(telemetry.tensometer).toFixed(1),
    batStand: telemetry.batteryStand.toFixed(2),
    batComp: telemetry.batteryComputer.toFixed(2),
    boost: telemetry.boostVoltage.toFixed(2),
    starter: telemetry.starterSense.toFixed(2)
  };

  const liveSeriesData = React.useMemo(() => {
      if (!isLive) return {};

      const downsampleStart = performance.now();
      const rawSeries: Record<string, SensorDataPoint[]> = {
          tensometer: telemetry.tensometer,
          pressureTank: telemetry.pressureTank,
          pressureCombustion: telemetry.pressureCombustion,
          batteryStand: telemetry.batteryStandHist,
          batteryComputer: telemetry.batteryComputerHist,
          boostVoltage: telemetry.boostVoltageHist,
          starterSense: telemetry.starterSenseHist,
          servo: telemetry.servoPositionHist,
          ...telemetry.temperatureHist,
      };

      const next: Record<string, SensorDataPoint[]> = {};
      let inPoints = 0;
      let outPoints = 0;
      let lineCount = 0;
      for (const [key, visible] of Object.entries(visibleLines)) {
          if (!visible) continue;
          const raw = rawSeries[key] || [];
          const sampled = downsampleMinMax(raw, MAX_RENDER_POINTS);
          inPoints += raw.length;
          outPoints += sampled.length;
          lineCount += 1;
          next[key] = sampled;
      }
      probeCount('analysis.live.visible_lines', lineCount);
      probeCount('analysis.live.in_points', inPoints);
      probeCount('analysis.live.out_points', outPoints);
      probeDuration('analysis.live.downsample.ms', performance.now() - downsampleStart);
      return next;
  }, [
    isLive,
    visibleLines,
    telemetry.tensometer,
    telemetry.pressureTank,
    telemetry.pressureCombustion,
    telemetry.batteryStandHist,
    telemetry.batteryComputerHist,
    telemetry.boostVoltageHist,
    telemetry.starterSenseHist,
    telemetry.servoPositionHist,
    telemetry.temperatureHist,
  ]);

  const historySeriesData = React.useMemo(() => {
      if (isLive || !chartData) return {};
      const downsampleStart = performance.now();
      const next: Record<string, SensorDataPoint[]> = {};
      let inPoints = 0;
      let outPoints = 0;
      let lineCount = 0;
      for (const [key, visible] of Object.entries(visibleLines)) {
          if (!visible) continue;
          const raw = chartData[key] || [];
          const sampled = downsampleMinMax(raw, MAX_RENDER_POINTS);
          inPoints += raw.length;
          outPoints += sampled.length;
          lineCount += 1;
          next[key] = sampled;
      }
      probeCount('analysis.history.visible_lines', lineCount);
      probeCount('analysis.history.in_points', inPoints);
      probeCount('analysis.history.out_points', outPoints);
      probeDuration('analysis.history.downsample.ms', performance.now() - downsampleStart);
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

  return (
    <div className="grid grid-cols-12 grid-rows-12 gap-2 h-full">
        {/* Top-Left: Big Chart (Rows 1-8, Cols 1-9) */}
        <div className="col-span-9 row-span-8">
            <ScadaPanel title="ANALYSIS" className="h-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                        type="number" 
                        domain={[viewStart, viewStart + windowSize]} 
                        dataKey="timestamp" 
                        allowDataOverflow 
                        tick={{fill: '#64748b'}} 
                        tickFormatter={(t) => `${(t/1000).toFixed(0)}s`}
                    />
                    {/* Defined Axes */}
                    {visibleLines.tensometer && (
                        <YAxis yAxisId="thrust" orientation="left" stroke={SENSOR_COLORS.tensometer} domain={['auto', 'auto']} label={{ value: 'Kg', angle: -90, position: 'insideLeft', fill: SENSOR_COLORS.tensometer }} />
                    )}
                    {showAxisPressure && (
                        <YAxis yAxisId="pressure" orientation="left" stroke={SENSOR_COLORS.pressureTank} domain={['auto', 'auto']} label={{ value: 'Bar', angle: -90, position: 'insideLeft', fill: SENSOR_COLORS.pressureTank }} />
                    )}
                    {showAxisVoltage && (
                        <YAxis yAxisId="voltage" orientation="right" stroke={SENSOR_COLORS.batteryStand} domain={['auto', 'auto']} label={{ value: 'V', angle: 90, position: 'insideRight', fill: SENSOR_COLORS.batteryStand }} />
                    )}
                    {visibleLines.starterSense && (
                        <YAxis yAxisId="starter" orientation="right" stroke={SENSOR_COLORS.starterSense} domain={['auto', 'auto']} label={{ value: 'V(S)', angle: 90, position: 'insideRight', fill: SENSOR_COLORS.starterSense }} />
                    )}
                    {visibleLines.servo && (
                        <YAxis yAxisId="servo" orientation="right" stroke={SENSOR_COLORS.servo} domain={[0, 100]} label={{ value: '%', angle: 90, position: 'insideRight', fill: SENSOR_COLORS.servo }} />
                    )}
                    {showAxisTemp && (
                        <YAxis yAxisId="temp" orientation="right" stroke={TEMP_COLORS[0]} domain={['auto', 'auto']} label={{ value: '°C', angle: 90, position: 'insideRight', fill: TEMP_COLORS[0] }} />
                    )}

                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} labelFormatter={(val) => `T+${val}`} />
                    <Legend />
                    
                    {visibleLines.tensometer && <Line type="linear" yAxisId="thrust" dataKey="value" data={displayedSeriesData.tensometer || []} name="Thrust (kg)" stroke={SENSOR_COLORS.tensometer} dot={false} strokeWidth={2} isAnimationActive={false} />}
                    {visibleLines.pressureTank && <Line type="linear" yAxisId="pressure" dataKey="value" data={displayedSeriesData.pressureTank || []} name="Tank Press (bar)" stroke={SENSOR_COLORS.pressureTank} dot={false} strokeWidth={2} isAnimationActive={false} />}
                    {visibleLines.pressureCombustion && <Line type="linear" yAxisId="pressure" dataKey="value" data={displayedSeriesData.pressureCombustion || []} name="Comb Press (bar)" stroke={SENSOR_COLORS.pressureCombustion} dot={false} strokeWidth={2} isAnimationActive={false} />}
                    
                    {visibleLines.batteryStand && <Line type="linear" yAxisId="voltage" dataKey="value" data={displayedSeriesData.batteryStand || []} name="Bat Stand" stroke={SENSOR_COLORS.batteryStand} dot={false} strokeWidth={2} isAnimationActive={false} />}
                    {visibleLines.batteryComputer && <Line type="linear" yAxisId="voltage" dataKey="value" data={displayedSeriesData.batteryComputer || []} name="Bat Comp" stroke={SENSOR_COLORS.batteryComputer} dot={false} strokeWidth={2} isAnimationActive={false} />}
                    {visibleLines.boostVoltage && <Line type="linear" yAxisId="voltage" dataKey="value" data={displayedSeriesData.boostVoltage || []} name="Boost V" stroke={SENSOR_COLORS.boostVoltage} dot={false} strokeWidth={2} isAnimationActive={false} />}
                    
                    {visibleLines.starterSense && <Line type="linear" yAxisId="starter" dataKey="value" data={displayedSeriesData.starterSense || []} name="Starter" stroke={SENSOR_COLORS.starterSense} dot={false} strokeWidth={2} isAnimationActive={false} />}
                    {visibleLines.servo && <Line type="linear" yAxisId="servo" dataKey="value" data={displayedSeriesData.servo || []} name="Servo" stroke={SENSOR_COLORS.servo} dot={false} strokeWidth={2} isAnimationActive={false} />}

                    {knownSensors.map((key, idx) => (
                        visibleLines[key] && (
                            <Line key={key} type="linear" yAxisId="temp" dataKey="value" data={displayedSeriesData[key] || []} name={`T: ${key}`} stroke={TEMP_COLORS[idx % TEMP_COLORS.length]} dot={false} strokeWidth={2} isAnimationActive={false} />
                        )
                    ))}
                </LineChart>
            </ResponsiveContainer>
            </ScadaPanel>
        </div>

        {/* Top-Right: Current Values (Rows 1-8, Cols 10-12) */}
        <div className="col-span-3 row-span-8 flex flex-col gap-2">
            <ScadaPanel title="LIVE VALUES" className="flex-1">
                <div className="p-2 space-y-1 overflow-y-auto h-full pr-1 scrollbar-thin">
                    {/* Primary */}
                    <ValueDisplay label="THRUST" value={vals.thrust} unit=" KG" color="text-purple-400" />
                    <ValueDisplay label="TANK PRESS" value={vals.tank} unit=" BAR" color="text-cyan-400" />
                    <ValueDisplay label="COMB PRESS" value={vals.combustion} unit=" BAR" color="text-orange-400" />
                    
                    <div className="my-2 border-t border-slate-700/50"></div>
                    
                    {/* Power */}
                    <ValueDisplay label="STAND BATTERY" value={vals.batStand} unit=" V" color="text-green-400" />
                    <ValueDisplay label="CPU BATTERY" value={vals.batComp} unit=" V" color="text-green-400" />
                    <ValueDisplay label="BOOST VOLTAGE" value={vals.boost} unit=" V" color="text-amber-400" />
                    <ValueDisplay label="STARTER SENSE" value={vals.starter} unit=" V" color="text-purple-400" />

                    <div className="my-2 border-t border-slate-700/50"></div>

                    {/* Thermal */}
                    {Object.entries(telemetry.temperatures).map(([id, temp]: [string, number]) => (
                        <ValueDisplay key={id} label={`TEMP ${id}`} value={temp.toFixed(1)} unit=" °C" color="text-rose-400" />
                    ))}
                    {Object.keys(telemetry.temperatures).length === 0 && <div className="text-[10px] text-slate-600 text-center py-2">NO THERMAL DATA</div>}
                </div>
            </ScadaPanel>
            <ScadaPanel title="STATUS LOG" className="h-32">
                <div className="font-mono text-xs text-amber-300 p-2 break-all">
                    &gt; {telemetry.lastCmdStatus || "System Ready."}
                </div>
            </ScadaPanel>
        </div>

        {/* Bottom-Left: Data Controls & Navigation (Rows 9-12, Cols 10-12) */}
        <div className="col-span-9 row-span-4">
        <ScadaPanel title="DATA CONTROL" className="h-full">
            <div className="flex flex-col h-full p-2 gap-2">
                {/* Series Toggles */}
                <div className="flex flex-wrap gap-2">
                    {Object.entries(visibleLines).map(([key, active]) => (
                        <button key={key} onClick={() => toggleLine(key)} className={`px-2 py-1 border rounded text-[10px] font-bold uppercase flex items-center gap-2 ${active ? 'bg-slate-700 text-white border-slate-500' : 'bg-slate-900 text-slate-600 border-slate-800'}`}>
                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: SENSOR_COLORS[key] || TEMP_COLORS[0]}}></div>
                            {key}
                        </button>
                    ))}
                </div>
                
                {/* Navigation Bar */}
                <div className="mt-auto bg-slate-900/50 p-2 rounded border border-slate-700 flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                            <button 
                            onClick={() => setIsLive(!isLive)} 
                            className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold border shadow-lg ${isLive ? 'bg-cyan-900/80 border-cyan-500 text-cyan-400' : 'bg-slate-700/80 border-slate-500 text-slate-300'}`}
                            >
                            {isLive ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                            {isLive ? 'LIVE' : 'PAUSED'}
                            </button>

                            <div className="h-6 w-px bg-slate-700"></div>

                            <div className="flex items-center gap-1">
                                <button onClick={() => handleZoom('in')} className="p-1 hover:bg-slate-700 rounded"><ZoomIn size={16} className="text-slate-400"/></button>
                                <button onClick={() => handleZoom('out')} className="p-1 hover:bg-slate-700 rounded"><ZoomOut size={16} className="text-slate-400"/></button>
                                <span className="text-xs font-mono text-slate-500 ml-2">WINDOW: {(windowSize/1000).toFixed(1)}s</span>
                            </div>
                            
                            <div className="ml-auto text-xs font-mono text-slate-500">
                                CURSOR: T+{viewStart}
                            </div>
                        </div>

                        {/* History Scrollbar */}
                        <div className="relative h-6 w-full flex items-center">
                            <input 
                            type="range" 
                            min={telemetry.startTime} 
                            max={Math.max(telemetry.startTime, telemetry.lastPacketTimestamp - windowSize)} 
                            value={viewStart} 
                            onChange={handleScroll}
                            disabled={isLive}
                            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                            />
                        </div>
                </div>
            </div>
        </ScadaPanel>
        </div>

        {/* Bottom-Right: Master Control & Servo (Rows 9-12, Cols 10-12) */}
        <div className="col-span-3 row-span-8 flex flex-col gap-2">
            <div className="flex-1">
                <ServoPanel 
                    servoPosition={telemetry.servoPosition} 
                    servoState={telemetry.servoState}
                    systemState={telemetry.state}
                    actions={actions}
                />
            </div>
            <div className="flex-1">
                <ControlPanel 
                    systemState={telemetry.state} 
                    isUnsafe={telemetry.isUnsafe} 
                    actions={actions} 
                />
            </div>
        </div>
    </div>
  );
};
