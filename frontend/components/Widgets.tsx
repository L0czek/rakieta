
import React, { useMemo, useRef, useEffect, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';
import { SensorDataPoint } from '../types';
import { probeCount } from '@/utils/perfProbe';

export const SENSOR_COLORS: Record<string, string> = {
    tensometer: '#c084fc', 
    pressureTank: '#22d3ee', 
    pressureCombustion: '#fb923c',
    batteryStand: '#4ade80', 
    batteryComputer: '#2dd4bf', 
    boostVoltage: '#fbbf24',
    starterSense: '#a78bfa', 
    servo: '#f472b6',
};

export const TEMP_COLORS = ['#f87171', '#fda4af', '#e11d48', '#be123c'];

export const CHART_RANGES = {
  thrust: [0, 700] as [number, number],
  pressure: [0, 150] as [number, number],
  voltage: [0, 20] as [number, number],
  starter: [0, 2] as [number, number],
  servo: [0, 100] as [number, number],
  temp: [0, 200] as [number, number],
};

export const useChartSize = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = {
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        };
        setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
};

export const ScadaPanel = ({ title, children, className = "", danger = false, headerRight = null }: { title: string, children?: React.ReactNode, className?: string, danger?: boolean, headerRight?: React.ReactNode }) => (
  <div className={`relative flex flex-col bg-slate-800/80 border ${danger ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-cyan-500/30'} backdrop-blur-sm rounded-sm overflow-hidden ${className}`}>
    <div className={`px-2 py-1 text-xs font-bold tracking-widest border-b flex justify-between items-center ${danger ? 'bg-red-900/40 text-red-200 border-red-500/50' : 'bg-cyan-900/20 text-cyan-400 border-cyan-500/30'}`}>
      <span>{title.toUpperCase()}</span>
      {headerRight && <div className="font-mono">{headerRight}</div>}
    </div>
    <div className="flex-1 p-2 min-h-0 overflow-auto relative">
      {children}
    </div>
    {/* Corner accents */}
    <div className={`absolute top-0 left-0 w-2 h-2 border-t border-l ${danger ? 'border-red-500' : 'border-cyan-400'}`}></div>
    <div className={`absolute top-0 right-0 w-2 h-2 border-t border-r ${danger ? 'border-red-500' : 'border-cyan-400'}`}></div>
    <div className={`absolute bottom-0 left-0 w-2 h-2 border-b border-l ${danger ? 'border-red-500' : 'border-cyan-400'}`}></div>
    <div className={`absolute bottom-0 right-0 w-2 h-2 border-b border-r ${danger ? 'border-red-500' : 'border-cyan-400'}`}></div>
  </div>
);

export const FastChart = ({ data, color, domain = CHART_RANGES.pressure }: { data: SensorDataPoint[], color: string, domain?: [number, number] }) => {
  probeCount('render.FastChart');
  // Performance optimization: only render if data exists
  if (!data || data.length === 0) return <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">NO SIGNAL</div>;

  const prevDataRef = useRef<SensorDataPoint[] | null>(null);
  if (prevDataRef.current !== data) {
    probeCount('render.FastChart.data_identity_changes');
    prevDataRef.current = data;
  }

  const { ref, size } = useChartSize();

  const chartData = useMemo(() => {
    if (data.length === 0) return [[], []] as [number[], number[]];
    const xVals = data.map((point) => point.timestamp);
    const yVals = data.map((point) => point.value);
    return [xVals, yVals] as [number[], number[]];
  }, [data]);

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: size.width,
      height: size.height,
      scales: {
        x: { time: false },
        y: { range: () => domain },
      },
      series: [
        {},
        {
          label: 'Value',
          stroke: color,
          width: 2,
          points: { show: false },
        },
      ],
      axes: [
        {
          stroke: '#64748b',
          grid: { stroke: '#334155' },
          ticks: { stroke: '#334155' },
          splits: (u) => {
            const min = u.scales.x.min ?? 0;
            const max = u.scales.x.max ?? 0;
            const step = 100;
            const start = Math.ceil(min / step) * step;
            const splits: number[] = [];
            for (let v = start; v <= max; v += step) {
              splits.push(v);
            }
            return splits;
          },
          values: (_u, ticks) =>
            ticks.map((val, idx) => (idx % 5 === 0 ? `${(val / 1000).toFixed(1)}s` : '')),
        },
        {
          stroke: '#64748b',
          grid: { stroke: '#334155' },
          ticks: { stroke: '#334155' },
          values: (_u, vals) => vals.map((val) => `${val}`),
        },
      ],
      legend: { show: false },
      cursor: { show: false },
    };
  }, [size.width, size.height, color, domain]);

  useEffect(() => {
    probeCount('effect.FastChart.commit');
  });

  return (
    <div ref={ref} className="w-full h-full">
      {size.width > 0 && size.height > 0 ? (
        <UplotReact options={options} data={chartData} />
      ) : null}
    </div>
  );
};

export const ValueDisplay: React.FC<{ label: string, value: string | number, unit?: string, color?: string }> = ({ label, value, unit, color = "text-cyan-400" }) => (
  <div className="flex justify-between items-end border-b border-slate-700 pb-1 mb-1 last:border-0">
    <span className="text-slate-400 text-xs uppercase">{label}</span>
    <span className={`text-xl font-mono font-bold ${color}`}>
      {value}<span className="text-xs text-slate-500 ml-1">{unit}</span>
    </span>
  </div>
);

export const DigitalIndicator = ({ active, label, color = "bg-green-500" }: { active: boolean, label: string, color?: string }) => (
    <div className={`flex items-center gap-2 p-2 rounded border ${active ? `border-${color.split('-')[1]}-500 bg-${color.split('-')[1]}-900/20` : 'border-slate-700 bg-slate-900/50 opacity-50'}`}>
        <div className={`w-3 h-3 rounded-full ${active ? `${color} shadow-[0_0_8px_currentColor]` : 'bg-slate-700'}`}></div>
        <span className={`text-xs font-bold tracking-wider ${active ? 'text-white' : 'text-slate-500'}`}>{label}</span>
    </div>
)
