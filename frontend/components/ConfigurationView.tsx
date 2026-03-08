import React, { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import {
    AnalogChannel,
    ConversionSettings,
    LutPoint,
    exportConversionSettingsToJson,
    getConversionSettings,
    importConversionSettingsFromJson,
    resetConversionSettings,
    setConversionSettings,
} from '@/utils/conversions';
import { ScadaPanel, useChartSize } from '@/components/Widgets';
import { CHART_COLORS } from '@/theme/tokens';

interface ConfigurationViewProps {
    onDirtyChange?: (isDirty: boolean) => void;
}

const ANALOG_CHANNELS: AnalogChannel[] = [
    'tensometer',
    'pressureTank',
    'pressureCombustion',
    'batteryStand',
    'batteryComputer',
    'boostVoltage',
    'starterSense',
];

const CHANNEL_LABELS: Record<AnalogChannel, string> = {
    tensometer: 'TENSOMETER',
    pressureTank: 'PRESSURE TANK',
    pressureCombustion: 'PRESSURE COMBUSTION',
    batteryStand: 'BATTERY STAND',
    batteryComputer: 'BATTERY COMPUTER',
    boostVoltage: 'BOOST VOLTAGE',
    starterSense: 'STARTER SENSE',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const parseNumberInput = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
};

const normalizeLutForUi = (points: LutPoint[]): LutPoint[] => {
    return [...points]
        .map(point => ({ x: clamp(point.x, 0, 4095), y: clamp(point.y, 0, 1500) }))
        .sort((a, b) => a.x - b.x);
};

const LutChart: React.FC<{ points: LutPoint[]; onHoverIndexChange?: (index: number | null) => void; className?: string }> = ({ points, onHoverIndexChange, className = '' }) => {
    const { ref, size } = useChartSize();

    const sortedPoints = useMemo(() => {
        return points
            .map((point, index) => ({ ...point, originalIndex: index }))
            .sort((a, b) => a.x - b.x);
    }, [points]);

    const chartData = useMemo(() => {
        return [
            sortedPoints.map(point => point.x),
            sortedPoints.map(point => point.y),
        ] as [number[], number[]];
    }, [sortedPoints]);

    useEffect(() => {
        return () => onHoverIndexChange?.(null);
    }, [onHoverIndexChange]);

    const options = useMemo<uPlot.Options>(() => {
        return {
            width: size.width,
            height: size.height,
            scales: {
                x: { time: false, range: () => [0, 4095] },
                y: { range: () => [0, 1200] },
            },
            series: [
                {},
                {
                    label: 'LUT',
                    stroke: CHART_COLORS.accent,
                    width: 2,
                    points: { show: true, size: 7, stroke: CHART_COLORS.accent, fill: CHART_COLORS.accent },
                },
            ],
            axes: [
                {
                    stroke: CHART_COLORS.axis,
                    grid: { stroke: CHART_COLORS.grid },
                    ticks: { stroke: CHART_COLORS.grid },
                    splits: () => {
                        const splits: number[] = [];
                        for (let value = 0; value <= 4095; value += 256) {
                            splits.push(value);
                        }
                        if (splits[splits.length - 1] !== 4095) splits.push(4095);
                        return splits;
                    },
                    values: (_u, vals) => vals.map((val) => `${Math.round(val)}`),
                },
                {
                    stroke: CHART_COLORS.axis,
                    grid: { stroke: CHART_COLORS.grid },
                    ticks: { stroke: CHART_COLORS.grid },
                    size: 72,
                    splits: () => {
                        const splits: number[] = [];
                        for (let value = 0; value <= 1200; value += 100) {
                            splits.push(value);
                        }
                        if (splits[splits.length - 1] !== 1200) splits.push(1500);
                        return splits;
                    },
                    values: (_u, vals) => vals.map((val) => `${Math.round(val)} mV`),
                },
            ],
            legend: { show: false },
            hooks: {
                setCursor: [
                    (u) => {
                        const idx = u.cursor.idx;
                        if (idx == null) {
                            onHoverIndexChange?.(null);
                            return;
                        }
                        const originalIndex = sortedPoints[idx]?.originalIndex;
                        onHoverIndexChange?.(originalIndex ?? null);
                    },
                ],
            },
        };
    }, [size.width, size.height, onHoverIndexChange, sortedPoints]);

    return (
        <div ref={ref} className={`w-full h-full bg-scada-app border border-scada rounded p-2 ${className}`}>
            {size.width > 0 && size.height > 0 ? (
                <UplotReact options={options} data={chartData} />
            ) : null}
        </div>
    );
};

export const ConfigurationView: React.FC<ConfigurationViewProps> = ({ onDirtyChange }) => {
    const [settings, setSettingsState] = useState<ConversionSettings>(() => getConversionSettings());
    const [lastSavedSettings, setLastSavedSettings] = useState<ConversionSettings>(() => getConversionSettings());
    const [selectedChannel, setSelectedChannel] = useState<AnalogChannel>('tensometer');
    const [lutDrafts, setLutDrafts] = useState<Record<AnalogChannel, LutPoint[]>>(() => {
        const initial = getConversionSettings();
        return {
            tensometer: normalizeLutForUi(initial.lutByChannel.tensometer),
            pressureTank: normalizeLutForUi(initial.lutByChannel.pressureTank),
            pressureCombustion: normalizeLutForUi(initial.lutByChannel.pressureCombustion),
            batteryStand: normalizeLutForUi(initial.lutByChannel.batteryStand),
            batteryComputer: normalizeLutForUi(initial.lutByChannel.batteryComputer),
            boostVoltage: normalizeLutForUi(initial.lutByChannel.boostVoltage),
            starterSense: normalizeLutForUi(initial.lutByChannel.starterSense),
        };
    });
    const [status, setStatus] = useState<string>('');
    const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const statusClass = useMemo(() => {
        if (status.startsWith('ERROR')) return 'text-scada-danger';
        if (status.startsWith('IMPORTED')) return 'text-scada-success';
        return 'text-scada-accent';
    }, [status]);

    const selectedPoints = lutDrafts[selectedChannel];

    const buildSettingsFromDrafts = (base: ConversionSettings, drafts: Record<AnalogChannel, LutPoint[]>): ConversionSettings => ({
        ...base,
        lutByChannel: {
            tensometer: normalizeLutForUi(drafts.tensometer),
            pressureTank: normalizeLutForUi(drafts.pressureTank),
            pressureCombustion: normalizeLutForUi(drafts.pressureCombustion),
            batteryStand: normalizeLutForUi(drafts.batteryStand),
            batteryComputer: normalizeLutForUi(drafts.batteryComputer),
            boostVoltage: normalizeLutForUi(drafts.boostVoltage),
            starterSense: normalizeLutForUi(drafts.starterSense),
        },
    });

    const draftSettings = useMemo(() => buildSettingsFromDrafts(settings, lutDrafts), [settings, lutDrafts]);

    const hasUnsavedChanges = useMemo(
        () => JSON.stringify(draftSettings) !== JSON.stringify(lastSavedSettings),
        [draftSettings, lastSavedSettings]
    );

    useEffect(() => {
        onDirtyChange?.(hasUnsavedChanges);
    }, [hasUnsavedChanges, onDirtyChange]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        setHoveredPointIndex(null);
    }, [selectedChannel]);

    const refreshLutDrafts = (next: ConversionSettings) => {
        setLutDrafts({
            tensometer: normalizeLutForUi(next.lutByChannel.tensometer),
            pressureTank: normalizeLutForUi(next.lutByChannel.pressureTank),
            pressureCombustion: normalizeLutForUi(next.lutByChannel.pressureCombustion),
            batteryStand: normalizeLutForUi(next.lutByChannel.batteryStand),
            batteryComputer: normalizeLutForUi(next.lutByChannel.batteryComputer),
            boostVoltage: normalizeLutForUi(next.lutByChannel.boostVoltage),
            starterSense: normalizeLutForUi(next.lutByChannel.starterSense),
        });
    };

    const updateLutPoint = (channel: AnalogChannel, index: number, axis: 'x' | 'y', value: string) => {
        setLutDrafts(prev => {
            const rows = [...prev[channel]];
            const point = rows[index];
            if (!point) return prev;
            const nextPoint = {
                ...point,
                [axis]: axis === 'x' ? clamp(parseNumberInput(value), 0, 4095) : clamp(parseNumberInput(value), 0, 1500),
            };
            rows[index] = nextPoint;
            return { ...prev, [channel]: rows };
        });
    };

    const addLutPoint = (channel: AnalogChannel) => {
        setLutDrafts(prev => {
            const rows = [...prev[channel]];
            const last = rows[rows.length - 1] || { x: 0, y: 0 };
            rows.push({ x: clamp(last.x + 100, 0, 4095), y: last.y });
            return { ...prev, [channel]: rows };
        });
    };

    const removeLutPoint = (channel: AnalogChannel, index: number) => {
        setLutDrafts(prev => {
            const rows = prev[channel];
            if (rows.length <= 2) return prev;
            return { ...prev, [channel]: rows.filter((_, i) => i !== index) };
        });
    };

    const handleSaveAll = () => {
        try {
            const nextSettings: ConversionSettings = draftSettings;
            const saved = setConversionSettings(nextSettings);
            setSettingsState(saved);
            setLastSavedSettings(saved);
            refreshLutDrafts(saved);
            setStatus('SAVED');
        } catch (err: any) {
            setStatus(`ERROR: ${err.message || 'Failed to save settings.'}`);
        }
    };

    const handleReset = () => {
        const reset = resetConversionSettings();
        setSettingsState(reset);
        setLastSavedSettings(reset);
        refreshLutDrafts(reset);
        setStatus('RESET TO DEFAULTS');
    };

    const handleRevert = () => {
        setSettingsState(lastSavedSettings);
        refreshLutDrafts(lastSavedSettings);
        setStatus('REVERTED');
    };

    const handleExport = () => {
        const payload = exportConversionSettingsToJson();
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'conversion-settings.json';
        a.click();
        URL.revokeObjectURL(url);
        setStatus('EXPORTED');
    };

    const handleImportFile = async (file: File) => {
        try {
            const text = await file.text();
            const imported = importConversionSettingsFromJson(text);
            setSettingsState(imported);
            setLastSavedSettings(imported);
            refreshLutDrafts(imported);
            setStatus('IMPORTED');
        } catch (err: any) {
            setStatus(`ERROR: ${err.message || 'Import failed.'}`);
        }
    };

    return (
        <div className="h-full overflow-auto pr-1">
            <div className="grid grid-cols-1 gap-2 min-h-full lg:grid-cols-12">
                <div className="col-span-12 lg:col-span-4">
                    <ScadaPanel title="CONVERSION SETTINGS" className="h-full">
                        <div className="p-3 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">TENSOMETER DIVIDER RATIO</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.tensometerDividerRatio}
                                        onChange={e => setSettingsState(prev => ({ ...prev, tensometerDividerRatio: Number(e.target.value) }))}
                                        className="scada-input"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">TENSOMETER KG/V</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.tensometerKgPerV}
                                        onChange={e => setSettingsState(prev => ({ ...prev, tensometerKgPerV: Number(e.target.value) }))}
                                        className="scada-input"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">PRESSURE TANK DIVIDER RATIO</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.pressureDividerRatio.pressureTank}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            pressureDividerRatio: { ...prev.pressureDividerRatio, pressureTank: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">PRESSURE TANK BAR/V</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.pressureScaleBarPerV.pressureTank}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            pressureScaleBarPerV: { ...prev.pressureScaleBarPerV, pressureTank: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">PRESSURE COMBUSTION DIVIDER RATIO</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.pressureDividerRatio.pressureCombustion}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            pressureDividerRatio: { ...prev.pressureDividerRatio, pressureCombustion: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">PRESSURE COMBUSTION BAR/V</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.pressureScaleBarPerV.pressureCombustion}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            pressureScaleBarPerV: { ...prev.pressureScaleBarPerV, pressureCombustion: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">STAND BATTERY DIVIDER RATIO</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.voltageDividerRatio.batteryStand}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            voltageDividerRatio: { ...prev.voltageDividerRatio, batteryStand: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>
                                <div>
                                </div>

                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">COMPUTER BATTERY DIVIDER RATIO</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.voltageDividerRatio.batteryComputer}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            voltageDividerRatio: { ...prev.voltageDividerRatio, batteryComputer: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>
                                <div>
                                </div>

                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">STARTER SENSE DIVIDER RATIO</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.voltageDividerRatio.starterSense}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            voltageDividerRatio: { ...prev.voltageDividerRatio, starterSense: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>
                                <div>
                                </div>

                                <div>
                                    <label className="text-xs text-scada-secondary block mb-1">BOOST VOLTAGE DIVIDER RATIO</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={settings.voltageDividerRatio.boostVoltage}
                                        onChange={e => setSettingsState(prev => ({
                                            ...prev,
                                            voltageDividerRatio: { ...prev.voltageDividerRatio, boostVoltage: Number(e.target.value) }
                                        }))}
                                        className="scada-input"
                                    />
                                </div>
                                <div>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-scada space-y-2">
                                <div className="flex gap-2">
                                    <button onClick={handleSaveAll} disabled={!hasUnsavedChanges} className="flex-1 bg-scada-accent-strong hover:bg-[var(--scada-bg-accent)] text-scada-inverse font-bold py-2.5 min-h-11 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                                        SAVE SETTINGS
                                    </button>
                                    <button onClick={handleRevert} disabled={!hasUnsavedChanges} className="flex-1 bg-scada-surface-strong hover:bg-[var(--scada-bg-surface-strong)] text-scada-inverse font-bold py-2.5 min-h-11 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                                        REVERT CHANGES
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleExport} className="flex-1 bg-scada-surface-strong hover:bg-[var(--scada-bg-surface-strong)] text-scada-inverse font-bold py-2.5 min-h-11 text-sm">
                                        EXPORT JSON
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-scada-surface-strong hover:bg-[var(--scada-bg-surface-strong)] text-scada-inverse font-bold py-2.5 min-h-11 text-sm">
                                        IMPORT JSON
                                    </button>
                                </div>
                                <button onClick={handleReset} className="w-full bg-scada-surface-strong hover:bg-[var(--scada-bg-surface-strong)] text-scada-inverse font-bold py-2.5 min-h-11 text-sm">
                                    RESET TO DEFAULTS
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/json"
                                    className="hidden"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleImportFile(file);
                                        e.currentTarget.value = '';
                                    }}
                                />
                                <div className={`text-xs font-mono ${statusClass}`}>{status || 'READY'}</div>
                            </div>
                        </div>
                    </ScadaPanel>
                </div>

                <div className="col-span-12 lg:col-span-8">
                    <ScadaPanel title="ADC LUT" className="h-full">
                        <div className="p-3 h-full flex flex-col gap-3 min-h-0">
                            <div>
                                <label className="text-xs text-scada-secondary block mb-1">SELECT CHANNEL</label>
                                <select
                                    value={selectedChannel}
                                    onChange={e => setSelectedChannel(e.target.value as AnalogChannel)}
                                    className="scada-input text-sm"
                                >
                                    {ANALOG_CHANNELS.map(channel => (
                                        <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1 min-h-0 border border-scada rounded p-2 bg-scada-surface-softer flex flex-col lg:flex-row gap-3">
                                <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
                                    <div className="lg:h-full lg:aspect-square lg:w-auto w-full aspect-square shrink-0">
                                        <LutChart points={normalizeLutForUi(selectedPoints)} onHoverIndexChange={setHoveredPointIndex} />
                                    </div>
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        <div className="border border-scada rounded overflow-auto flex-1 min-h-0">
                                            <table className="w-full text-xs font-mono">
                                        <thead className="bg-scada-app text-scada-secondary">
                                            <tr>
                                                <th className="text-left px-2 py-1">ADC X</th>
                                                <th className="text-left px-2 py-1">mV Y</th>
                                                <th className="text-left px-2 py-1 w-16">DEL</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedPoints.map((point, idx) => (
                                                <tr key={`${selectedChannel}-${idx}`} className={`border-t border-scada-weak ${hoveredPointIndex === idx ? 'bg-scada-accent-strong' : ''}`}>
                                                    <td className="px-2 py-1">
                                                        <input
                                                            type="number"
                                                            step="1"
                                                            min={0}
                                                            max={4095}
                                                            value={point.x}
                                                            onChange={e => updateLutPoint(selectedChannel, idx, 'x', e.target.value)}
                                                            className={`w-full border bg-scada-surface px-2 py-2 min-h-11 text-scada-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30 ${hoveredPointIndex === idx ? 'border-scada-accent text-scada-accent-bright' : 'border-scada'}`}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-1">
                                                        <input
                                                            type="number"
                                                            step="1"
                                                            min={0}
                                                            max={1500}
                                                            value={point.y}
                                                            onChange={e => updateLutPoint(selectedChannel, idx, 'y', e.target.value)}
                                                            className={`w-full border bg-scada-surface px-2 py-2 min-h-11 text-scada-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30 ${hoveredPointIndex === idx ? 'border-scada-accent text-scada-accent-bright' : 'border-scada'}`}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-1">
                                                        <button
                                                            onClick={() => removeLutPoint(selectedChannel, idx)}
                                                            className="w-full bg-scada-surface-elevated hover:bg-[var(--scada-bg-surface-strong)] text-scada-secondary px-2 py-2 min-h-11 disabled:opacity-40"
                                                            disabled={selectedPoints.length <= 2}
                                                        >
                                                            X
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                            </table>
                                        </div>
                                        <button
                                            onClick={() => addLutPoint(selectedChannel)}
                                            className="mt-2 w-full bg-scada-surface-elevated hover:bg-[var(--scada-bg-surface-strong)] text-scada-secondary font-bold py-2.5 min-h-11 text-xs"
                                        >
                                            ADD LUT POINT
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScadaPanel>
                </div>
            </div>
        </div>
    );
};
