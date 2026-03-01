
import React from 'react';
import { SystemTelemetry } from '../types';
import { ScadaPanel, FastChart, SENSOR_COLORS, CHART_RANGES, TEMP_COLORS } from './Widgets';
import { ControlPanel } from './ControlPanel';
import { ServoPanel } from './ServoPanel';

interface DashboardViewProps {
    telemetry: SystemTelemetry;
    actions: any;
    commandsEnabled: boolean;
}

const MiniTrendChart: React.FC<{
    data: { timestamp: number; value: number }[];
    color: string;
    xDomain: [number, number];
}> = ({ data, color, xDomain }) => {
    const width = 84;
    const height = 22;
    const [xMin, xMax] = xDomain;

    const xRange = Math.max(1, xMax - xMin);
    const visibleData = data.filter((point) => point.timestamp >= xMin && point.timestamp <= xMax);
    const visibleValues = visibleData.map((point) => point.value);
    const rawMin = visibleValues.length > 0 ? Math.min(...visibleValues) : 0;
    const rawMax = visibleValues.length > 0 ? Math.max(...visibleValues) : 1;
    const isFlat = rawMax === rawMin;
    const pad = isFlat ? Math.max(0.5, Math.abs(rawMax) * 0.05) : (rawMax - rawMin) * 0.1;
    const yMin = rawMin - pad;
    const yMax = rawMax + pad;
    const yRange = Math.max(1e-6, yMax - yMin);

    const points = visibleData
        .map((point) => {
            const x = ((point.timestamp - xMin) / xRange) * width;
            const normalizedY = (point.value - yMin) / yRange;
            const y = height - Math.max(0, Math.min(1, normalizedY)) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
            {points.length > 1 ? (
                <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ) : null}
        </svg>
    );
};

export const DashboardView: React.FC<DashboardViewProps> = ({ telemetry, actions, commandsEnabled }) => {
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
    const latestTemperatures = Object.entries(telemetry.temperatures as Record<string, { value: number }[]>)
        .map(([id, points]) => ({ id, value: getLatestValue(points) }));
    const servoPositionDegrees = getLatestValue(telemetry.servoPosition);
  
    const vals = {
        tank: getLatestValue(telemetry.pressureTank).toFixed(1),
        combustion: getLatestValue(telemetry.pressureCombustion).toFixed(1),
        thrust: getLatestValue(telemetry.tensometer).toFixed(1),
        batStand: getLatestValue(telemetry.batteryStand).toFixed(2),
        batComp: getLatestValue(telemetry.batteryComputer).toFixed(2),
        boost: getLatestValue(telemetry.boostVoltage).toFixed(2),
        starter: getLatestValue(telemetry.starterSense).toFixed(2)
    };

    const chartWindowEnd = Math.ceil(telemetry.lastPacketTimestamp / 100) * 100;
    const chartWindowStart = chartWindowEnd - 5000;
    const chartXDomain: [number, number] = [chartWindowStart, chartWindowEnd];

    return (
        <div className="grid grid-cols-12 grid-rows-12 gap-2 h-full">
            {/* Dashboard layout */}
            <div className="col-span-8 row-span-4">
                <ScadaPanel 
                    title={getSeriesLabel('pressureTank')} 
                    className="h-full" 
                    headerRight={<span>{vals.tank} <span className="text-slate-500 text-[10px]">BAR</span></span>}
                >
                    <FastChart data={telemetry.pressureTank} color={SENSOR_COLORS.pressureTank} domain={CHART_RANGES.pressure} xDomain={chartXDomain} />
                </ScadaPanel>
            </div>
            <div className="col-span-4 row-span-4 flex flex-col gap-2">
                    <ScadaPanel title="POWER SYSTEMS" className="flex-1">
                        <div className="p-2 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-slate-400 text-xs uppercase truncate min-w-0">{getSeriesLabel('batteryStand')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.batteryStand} color={SENSOR_COLORS.batteryStand} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-green-400 text-right leading-none">{vals.batStand}<span className="text-xs text-slate-500 ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-slate-400 text-xs uppercase truncate min-w-0">{getSeriesLabel('batteryComputer')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.batteryComputer} color={SENSOR_COLORS.batteryComputer} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-green-400 text-right leading-none">{vals.batComp}<span className="text-xs text-slate-500 ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-slate-400 text-xs uppercase truncate min-w-0">{getSeriesLabel('boostVoltage')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.boostVoltage} color={SENSOR_COLORS.boostVoltage} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-amber-400 text-right leading-none">{vals.boost}<span className="text-xs text-slate-500 ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-1 last:border-0 gap-2 min-w-0">
                            <div className="text-slate-400 text-xs uppercase truncate min-w-0">{getSeriesLabel('starterSense')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.starterSense} color={SENSOR_COLORS.starterSense} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-purple-400 text-right leading-none">{vals.starter}<span className="text-xs text-slate-500 ml-1"> V</span></div>
                            </div>
                        </div>
                        </div>
                    </ScadaPanel>
                                        <ScadaPanel title="STATUS LOG" className="h-24">
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
                                                                  className={`break-all ${entry.type === 'connection' ? 'text-cyan-300' : 'text-amber-300'}`}
                                                                >
                                                                    <span className="text-slate-500">[{new Date(entry.receivedAt).toLocaleString()}]</span>{' '}
                                                                    &gt; {entry.message}
                                                                </div>
                                                            ))}
                                                </div>
                                        </ScadaPanel>
            </div>
            <div className="col-span-8 row-span-4">
                    <ScadaPanel 
                    title={getSeriesLabel('pressureCombustion')} 
                    className="h-full"
                    headerRight={<span>{vals.combustion} <span className="text-slate-500 text-[10px]">BAR</span></span>}
                    >
                    <FastChart data={telemetry.pressureCombustion} color={SENSOR_COLORS.pressureCombustion} domain={CHART_RANGES.pressure} xDomain={chartXDomain} />
                </ScadaPanel>
            </div>
            <div className="col-span-4 row-span-4 flex flex-col gap-2">
                <div className="flex-1">
                    <ScadaPanel title="THERMAL SENSORS (°C)" className="h-full">
                            <div className="p-2 grid grid-cols-2 gap-2 overflow-y-auto">
                                {latestTemperatures.map(({ id, value: temp }, index) => (
                                    <div key={id} className="bg-slate-900/50 p-2 border border-slate-700 rounded flex items-center justify-between gap-2 min-w-0">
                                        <div className="text-[10px] text-slate-500 truncate min-w-0">{getSeriesLabel(id)}</div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <MiniTrendChart
                                                data={telemetry.temperatures[id] || []}
                                                color={TEMP_COLORS[index % TEMP_COLORS.length]}
                                                xDomain={chartXDomain}
                                            />
                                            <div className="text-xl font-mono font-bold text-rose-400 text-right leading-none">{temp.toFixed(1)}<span className="text-xs text-slate-500 ml-1"> °C</span></div>
                                        </div>
                                    </div>
                                ))}
                                {latestTemperatures.length === 0 && <div className="col-span-2 text-xs text-slate-600 text-center py-4">NO THERMAL DATA</div>}
                            </div>
                        </ScadaPanel>
                </div>
                <div className="flex-1">
                    <ServoPanel
                        servoPositionDegrees={servoPositionDegrees}
                        servoState={telemetry.servoState}
                        systemState={telemetry.state}
                        actions={actions}
                        commandsEnabled={commandsEnabled}
                    />
                </div>
            </div>
            <div className="col-span-8 row-span-4">
                    <ScadaPanel 
                    title={getSeriesLabel('tensometer')} 
                    className="h-full"
                    headerRight={<span>{vals.thrust} <span className="text-slate-500 text-[10px]">KG</span></span>}
                    >
                    <FastChart data={telemetry.tensometer} color={SENSOR_COLORS.tensometer} domain={CHART_RANGES.thrust} xDomain={chartXDomain} />
                    </ScadaPanel>
            </div>
            <div className="col-span-4 row-span-4">
                <ControlPanel
                    systemState={telemetry.state}
                    isUnsafe={telemetry.isUnsafe}
                    actions={actions}
                    commandsEnabled={commandsEnabled}
                />
            </div>
        </div>
    );
};
