
import React from 'react';
import { SensorDataPoint, SystemTelemetry } from '@/types';
import { ScadaPanel, FastChart, SENSOR_COLORS, CHART_RANGES, TEMP_COLORS, useChartSize } from '@/components/Widgets';
import { ControlPanel } from '@/components/ControlPanel';
import { ServoPanel } from '@/components/ServoPanel';

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

const CombinedPressureChart: React.FC<{
    tankData: SensorDataPoint[];
    combustionData: SensorDataPoint[];
    xDomain: [number, number];
}> = ({ tankData, combustionData, xDomain }) => {
    const { ref, size } = useChartSize();
    const [xMin, xMax] = xDomain;
    const xRange = Math.max(1, xMax - xMin);
    const [yMin, yMax] = CHART_RANGES.pressure;
    const yRange = Math.max(1, yMax - yMin);

    const toPoints = (data: SensorDataPoint[]) =>
        data
            .filter((point) => point.timestamp >= xMin && point.timestamp <= xMax)
            .map((point) => {
                const x = ((point.timestamp - xMin) / xRange) * size.width;
                const normalizedY = (point.value - yMin) / yRange;
                const y = size.height - Math.max(0, Math.min(1, normalizedY)) * size.height;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

    const tankPoints = toPoints(tankData);
    const combustionPoints = toPoints(combustionData);

    return (
        <div ref={ref} className="w-full h-full min-h-[160px]">
            {size.width > 0 && size.height > 0 ? (
                <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
                    <line x1="0" y1={size.height * 0.25} x2={size.width} y2={size.height * 0.25} stroke="rgba(51,65,85,0.45)" strokeWidth="1" />
                    <line x1="0" y1={size.height * 0.5} x2={size.width} y2={size.height * 0.5} stroke="rgba(51,65,85,0.45)" strokeWidth="1" />
                    <line x1="0" y1={size.height * 0.75} x2={size.width} y2={size.height * 0.75} stroke="rgba(51,65,85,0.45)" strokeWidth="1" />
                    {tankPoints.length > 0 ? (
                        <polyline
                            points={tankPoints}
                            fill="none"
                            stroke={SENSOR_COLORS.pressureTank}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ) : null}
                    {combustionPoints.length > 0 ? (
                        <polyline
                            points={combustionPoints}
                            fill="none"
                            stroke={SENSOR_COLORS.pressureCombustion}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ) : null}
                </svg>
            ) : null}
        </div>
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
    const statusLogEntries = (telemetry.statusLog.length > 0
        ? telemetry.statusLog
        : [{ message: 'System Ready.', receivedAt: 0, type: 'status' as const }]
    ).slice().reverse();

    return (
        <div className="grid grid-cols-1 gap-2 auto-rows-[minmax(220px,auto)] min-h-full md:grid-cols-12 md:grid-rows-12 md:h-full">
            {/* Mobile-only order: power, thermal, pressures, servo, tensometer, status, master */}
            <div className="order-1 md:hidden">
                <ScadaPanel title="POWER SYSTEMS" className="h-full">
                    <div className="p-2 space-y-2">
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('batteryStand')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.batteryStand} color={SENSOR_COLORS.batteryStand} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-success text-right leading-none">{vals.batStand}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('batteryComputer')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.batteryComputer} color={SENSOR_COLORS.batteryComputer} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-success text-right leading-none">{vals.batComp}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('boostVoltage')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.boostVoltage} color={SENSOR_COLORS.boostVoltage} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-warning text-right leading-none">{vals.boost}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 last:border-0 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('starterSense')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.starterSense} color={SENSOR_COLORS.starterSense} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-series-violet text-right leading-none">{vals.starter}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                    </div>
                </ScadaPanel>
            </div>

            <div className="order-2 md:hidden">
                <ScadaPanel title="THERMAL SENSORS (°C)" className="h-full">
                    <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto">
                        {latestTemperatures.map(({ id, value: temp }, index) => (
                            <div key={id} className="bg-scada-surface-soft p-2 border border-scada rounded flex items-center justify-between gap-2 min-w-0">
                                <div className="text-[10px] text-scada-muted truncate min-w-0">{getSeriesLabel(id)}</div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <MiniTrendChart
                                        data={telemetry.temperatures[id] || []}
                                        color={TEMP_COLORS[index % TEMP_COLORS.length]}
                                        xDomain={chartXDomain}
                                    />
                                    <div className="text-xl font-mono font-bold text-scada-series-temp text-right leading-none">{temp.toFixed(1)}<span className="text-xs text-scada-muted ml-1"> °C</span></div>
                                </div>
                            </div>
                        ))}
                        {latestTemperatures.length === 0 && <div className="col-span-2 text-xs text-scada-muted text-center py-4">NO THERMAL DATA</div>}
                    </div>
                </ScadaPanel>
            </div>

            <div className="order-3 min-h-[220px] md:hidden">
                <ScadaPanel title="PRESSURES" className="h-full">
                    <div className="h-full flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                            <div className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENSOR_COLORS.pressureTank }}></span>
                                <span className="text-scada-secondary">{vals.tank} BAR</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENSOR_COLORS.pressureCombustion }}></span>
                                <span className="text-scada-secondary">{vals.combustion} BAR</span>
                            </div>
                        </div>
                        <div className="flex-1 min-h-[160px]">
                            <CombinedPressureChart
                                tankData={telemetry.pressureTank}
                                combustionData={telemetry.pressureCombustion}
                                xDomain={chartXDomain}
                            />
                        </div>
                    </div>
                </ScadaPanel>
            </div>

            <div className="order-4 md:hidden">
                <ServoPanel
                    servoPositionDegrees={servoPositionDegrees}
                    servoState={telemetry.servoState}
                    systemState={telemetry.state}
                    actions={actions}
                    commandsEnabled={commandsEnabled}
                />
            </div>

            {/* Desktop layout */}
            <div className="hidden min-h-[220px] md:block md:col-span-8 md:row-span-4 md:min-h-0">
                <ScadaPanel 
                    title={getSeriesLabel('pressureTank')} 
                    className="h-full" 
                    headerRight={<span>{vals.tank} <span className="text-scada-muted text-[10px]">BAR</span></span>}
                >
                    <FastChart data={telemetry.pressureTank} color={SENSOR_COLORS.pressureTank} domain={CHART_RANGES.pressure} xDomain={chartXDomain} />
                </ScadaPanel>
            </div>
            <div className="hidden flex-col gap-2 md:flex md:col-span-4 md:row-span-4">
                    <ScadaPanel title="POWER SYSTEMS" className="flex-1">
                        <div className="p-2 space-y-2">
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('batteryStand')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.batteryStand} color={SENSOR_COLORS.batteryStand} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-success text-right leading-none">{vals.batStand}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('batteryComputer')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.batteryComputer} color={SENSOR_COLORS.batteryComputer} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-success text-right leading-none">{vals.batComp}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('boostVoltage')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.boostVoltage} color={SENSOR_COLORS.boostVoltage} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-warning text-right leading-none">{vals.boost}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-scada pb-1 mb-1 last:border-0 gap-2 min-w-0">
                            <div className="text-scada-secondary text-xs uppercase truncate min-w-0">{getSeriesLabel('starterSense')}</div>
                            <div className="flex items-center gap-2 shrink-0">
                                <MiniTrendChart data={telemetry.starterSense} color={SENSOR_COLORS.starterSense} xDomain={chartXDomain} />
                                <div className="text-xl font-mono font-bold text-scada-series-violet text-right leading-none">{vals.starter}<span className="text-xs text-scada-muted ml-1"> V</span></div>
                            </div>
                        </div>
                        </div>
                    </ScadaPanel>
                    <ScadaPanel title="STATUS LOG" className="h-40 md:h-24">
                        <div className="font-mono text-xs p-2 h-full overflow-y-auto pr-1 scrollbar-thin space-y-1">
                            {statusLogEntries.map((entry, index) => (
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
            <div className="hidden min-h-[220px] md:block md:col-span-8 md:row-span-4 md:min-h-0">
                    <ScadaPanel 
                    title={getSeriesLabel('pressureCombustion')} 
                    className="h-full"
                    headerRight={<span>{vals.combustion} <span className="text-scada-muted text-[10px]">BAR</span></span>}
                    >
                    <FastChart data={telemetry.pressureCombustion} color={SENSOR_COLORS.pressureCombustion} domain={CHART_RANGES.pressure} xDomain={chartXDomain} />
                </ScadaPanel>
            </div>
            <div className="hidden flex-col gap-2 md:flex md:col-span-4 md:row-span-4">
                <div className="flex-1">
                    <ScadaPanel title="THERMAL SENSORS (°C)" className="h-full">
                            <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto">
                                {latestTemperatures.map(({ id, value: temp }, index) => (
                                    <div key={id} className="bg-scada-surface-soft p-2 border border-scada rounded flex items-center justify-between gap-2 min-w-0">
                                        <div className="text-[10px] text-scada-muted truncate min-w-0">{getSeriesLabel(id)}</div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <MiniTrendChart
                                                data={telemetry.temperatures[id] || []}
                                                color={TEMP_COLORS[index % TEMP_COLORS.length]}
                                                xDomain={chartXDomain}
                                            />
                                            <div className="text-xl font-mono font-bold text-scada-series-temp text-right leading-none">{temp.toFixed(1)}<span className="text-xs text-scada-muted ml-1"> °C</span></div>
                                        </div>
                                    </div>
                                ))}
                                {latestTemperatures.length === 0 && <div className="col-span-2 text-xs text-scada-muted text-center py-4">NO THERMAL DATA</div>}
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
            <div className="order-5 min-h-[220px] md:col-span-8 md:row-span-4 md:min-h-0">
                    <ScadaPanel 
                    title={getSeriesLabel('tensometer')} 
                    className="h-full"
                    headerRight={<span>{vals.thrust} <span className="text-scada-muted text-[10px]">KG</span></span>}
                    >
                    <FastChart data={telemetry.tensometer} color={SENSOR_COLORS.tensometer} domain={CHART_RANGES.thrust} xDomain={chartXDomain} />
                    </ScadaPanel>
            </div>

            <div className="order-6 md:hidden">
                <ScadaPanel title="STATUS LOG" className="h-full">
                    <div className="font-mono text-xs p-2 h-full overflow-y-auto pr-1 scrollbar-thin space-y-1">
                        {statusLogEntries.map((entry, index) => (
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

            <div className="order-7 md:col-span-4 md:row-span-4">
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
