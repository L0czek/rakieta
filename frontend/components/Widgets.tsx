
import React, { useMemo, useRef, useEffect, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';
import { SensorDataPoint } from '@/types';
import { CHART_COLORS, SENSOR_COLORS, TEMP_COLORS } from '@/theme/tokens';

export { SENSOR_COLORS, TEMP_COLORS };

export const CHART_RANGES = {
  thrust: [0, 700] as [number, number],
  pressure: [0, 150] as [number, number],
  voltage: [0, 20] as [number, number],
  starter: [0, 2] as [number, number],
  servo: [0, 180] as [number, number],
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

const CHART_AXIS_COLOR = CHART_COLORS.axis;
const CHART_GRID_COLOR = CHART_COLORS.grid;

export const ScadaPanel = ({ title, children, className = "", danger = false, headerRight = null }: { title: string, children?: React.ReactNode, className?: string, danger?: boolean, headerRight?: React.ReactNode }) => (
  <div className={`relative flex flex-col bg-scada-surface-soft-strong border ${danger ? 'border-scada-danger shadow-scada-danger-soft' : 'border-scada-accent-soft'} rounded-sm overflow-hidden ${className}`}>
    <div className={`px-2 py-1 text-xs font-bold tracking-widest border-b flex justify-between items-center ${danger ? 'bg-scada-danger-soft text-scada-danger-soft border-scada-danger' : 'bg-scada-accent-soft text-scada-accent border-scada-accent-soft'}`}>
      <span>{title.toUpperCase()}</span>
      {headerRight && <div className="font-mono">{headerRight}</div>}
    </div>
    <div className="flex-1 p-2 min-h-0 overflow-auto relative">
      {children}
    </div>
    {/* Corner accents */}
    <div className={`absolute top-0 left-0 w-2 h-2 border-t border-l ${danger ? 'border-scada-danger' : 'border-scada-accent'}`}></div>
    <div className={`absolute top-0 right-0 w-2 h-2 border-t border-r ${danger ? 'border-scada-danger' : 'border-scada-accent'}`}></div>
    <div className={`absolute bottom-0 left-0 w-2 h-2 border-b border-l ${danger ? 'border-scada-danger' : 'border-scada-accent'}`}></div>
    <div className={`absolute bottom-0 right-0 w-2 h-2 border-b border-r ${danger ? 'border-scada-danger' : 'border-scada-accent'}`}></div>
  </div>
);

export const FastChart = ({
  data,
  color,
  domain = CHART_RANGES.pressure,
  xDomain,
}: {
  data: SensorDataPoint[];
  color: string;
  domain?: [number, number];
  xDomain?: [number, number];
}) => {
  // Performance optimization: only render if data exists
  if (!data || data.length === 0) return <div className="w-full h-full flex items-center justify-center text-scada-muted text-xs">NO SIGNAL</div>;

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
        x: { time: false, range: xDomain ? () => xDomain : undefined },
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
          stroke: CHART_AXIS_COLOR,
          grid: { stroke: CHART_GRID_COLOR },
          ticks: { stroke: CHART_GRID_COLOR },
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
          stroke: CHART_AXIS_COLOR,
          grid: { stroke: CHART_GRID_COLOR },
          ticks: { stroke: CHART_GRID_COLOR },
          values: (_u, vals) => vals.map((val) => `${val}`),
        },
      ],
      legend: { show: false },
      cursor: { show: false },
    };
  }, [size.width, size.height, color, domain, xDomain]);

  return (
    <div ref={ref} className="w-full h-full">
      {size.width > 0 && size.height > 0 ? (
        <UplotReact options={options} data={chartData} />
      ) : null}
    </div>
  );
};

export const ValueDisplay: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}> = ({ label, value, unit, color = "text-scada-accent" }) => (
    <div className="flex justify-between items-center border-b border-scada pb-0.5 mb-0.5 last:border-0">
      <span className="text-scada-secondary text-[11px] uppercase truncate pr-2">{label}</span>
      <span className={`text-lg font-mono font-bold leading-none ${color}`}>
        {value}
        <span className="text-[10px] text-scada-muted ml-1">{unit}</span>
      </span>
    </div>
  );

const DIGITAL_INDICATOR_STYLES = {
  success: {
    activeContainer: 'border-scada-success bg-scada-success-soft',
    activeDot: 'bg-scada-success',
  },
  warning: {
    activeContainer: 'border-scada-warning bg-scada-warning-soft',
    activeDot: 'bg-scada-warning',
  },
} as const;

export const DigitalIndicator = ({
  active,
  label,
  tone = 'success',
}: {
  active: boolean;
  label: string;
  tone?: keyof typeof DIGITAL_INDICATOR_STYLES;
}) => {
  const style = DIGITAL_INDICATOR_STYLES[tone];

  return (
    <div
      className={`flex items-center gap-2 rounded border p-2 ${
        active ? style.activeContainer : 'border-scada bg-scada-surface-soft opacity-50'
      }`}
    >
      <div
        className={`h-3 w-3 rounded-full ${
          active ? `${style.activeDot} shadow-[0_0_8px_currentColor]` : 'bg-scada-surface-strong'
        }`}
      />
      <span className={`text-xs font-bold tracking-wider ${active ? 'text-scada-inverse' : 'text-scada-muted'}`}>
        {label}
      </span>
    </div>
  );
};
