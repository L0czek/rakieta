
import React from 'react';
import { SystemTelemetry, SensorDataPoint } from '../types';
import { ScadaPanel, FastChart, ValueDisplay, SENSOR_COLORS, CHART_RANGES } from './Widgets';
import { ControlPanel } from './ControlPanel';
import { ServoPanel } from './ServoPanel';

interface DashboardViewProps {
    telemetry: SystemTelemetry;
    actions: any;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ telemetry, actions }) => {
    const sensorLabels: Record<string, string> = {
        tensometer: 'tensometer',
        pressureTank: 'tank pressure',
        pressureCombustion: 'combustion chamber pressure',
        batteryStand: 'test stand battery',
        batteryComputer: 'mainboard battery',
        boostVoltage: 'boost voltage',
        starterSense: 'starter sense',
    };
    const getSeriesLabel = (key: string) => sensorLabels[key] || `temp ${key}`;

    
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

    // Helper: Slice data to only show points within the last `windowMs` milliseconds
    const getDataInTimeWindow = (data: SensorDataPoint[], windowMs: number) => {
        if (!data || data.length === 0) return [];
        const cutoff = telemetry.lastPacketTimestamp - windowMs;
        
        // Optimization: If the buffer is fully within range, return it all
        if (data[0].timestamp >= cutoff) return data;
        
        // Find the start index
        const idx = data.findIndex(p => p.timestamp >= cutoff);
        return idx === -1 ? [] : data.slice(idx);
    };

    return (
        <div className="grid grid-cols-12 grid-rows-12 gap-2 h-full">
            {/* Dashboard layout */}
            <div className="col-span-8 row-span-4">
                <ScadaPanel 
                    title={getSeriesLabel('pressureTank')} 
                    className="h-full" 
                    headerRight={<span>{vals.tank} <span className="text-slate-500 text-[10px]">BAR</span></span>}
                >
                    <FastChart data={getDataInTimeWindow(telemetry.pressureTank, 5000)} color={SENSOR_COLORS.pressureTank} domain={CHART_RANGES.pressure} />
                </ScadaPanel>
            </div>
            <div className="col-span-4 row-span-4 flex flex-col gap-2">
                    <ScadaPanel title="POWER SYSTEMS" className="flex-1">
                        <div className="p-2 space-y-2">
                        <ValueDisplay label={getSeriesLabel('batteryStand')} value={vals.batStand} unit=" V" color="text-green-400" />
                        <ValueDisplay label={getSeriesLabel('batteryComputer')} value={vals.batComp} unit=" V" color="text-green-400" />
                        <ValueDisplay label={getSeriesLabel('boostVoltage')} value={vals.boost} unit=" V" color="text-amber-400" />
                        <ValueDisplay label={getSeriesLabel('starterSense')} value={vals.starter} unit=" V" color="text-purple-400" />
                        </div>
                    </ScadaPanel>
                    <ScadaPanel title="STATUS LOG" className="h-24">
                        <div className="font-mono text-xs text-amber-300 p-2 break-all">
                            &gt; {telemetry.lastCmdStatus || "System Ready."}
                        </div>
                    </ScadaPanel>
            </div>
            <div className="col-span-8 row-span-4">
                    <ScadaPanel 
                    title={getSeriesLabel('pressureCombustion')} 
                    className="h-full"
                    headerRight={<span>{vals.combustion} <span className="text-slate-500 text-[10px]">BAR</span></span>}
                    >
                    <FastChart data={getDataInTimeWindow(telemetry.pressureCombustion, 5000)} color={SENSOR_COLORS.pressureCombustion} domain={CHART_RANGES.pressure} />
                </ScadaPanel>
            </div>
            <div className="col-span-4 row-span-4 flex flex-col gap-2">
                <div className="flex-1">
                    <ScadaPanel title="THERMAL SENSORS (°C)" className="h-full">
                            <div className="p-2 grid grid-cols-2 gap-2 overflow-y-auto">
                                {Object.entries(telemetry.temperatures).map(([id, temp]: [string, number]) => (
                                    <div key={id} className="bg-slate-900/50 p-2 border border-slate-700 rounded">
                                        <div className="text-[10px] text-slate-500 truncate">{getSeriesLabel(id)}</div>
                                        <div className="text-lg font-mono text-rose-400">{temp.toFixed(1)}°</div>
                                    </div>
                                ))}
                                {Object.keys(telemetry.temperatures).length === 0 && <div className="col-span-2 text-xs text-slate-600 text-center py-4">NO THERMAL DATA</div>}
                            </div>
                        </ScadaPanel>
                </div>
                <div className="flex-1">
                    <ServoPanel servoPosition={telemetry.servoPosition} servoState={telemetry.servoState} systemState={telemetry.state} actions={actions} />
                </div>
            </div>
            <div className="col-span-8 row-span-4">
                    <ScadaPanel 
                    title={getSeriesLabel('tensometer')} 
                    className="h-full"
                    headerRight={<span>{vals.thrust} <span className="text-slate-500 text-[10px]">KG</span></span>}
                    >
                    <FastChart data={getDataInTimeWindow(telemetry.tensometer, 5000)} color={SENSOR_COLORS.tensometer} domain={CHART_RANGES.thrust} />
                    </ScadaPanel>
            </div>
            <div className="col-span-4 row-span-4">
                <ControlPanel systemState={telemetry.state} isUnsafe={telemetry.isUnsafe} actions={actions} />
            </div>
        </div>
    );
};
