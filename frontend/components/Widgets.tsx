
import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { SensorDataPoint } from '../types';
import { downsampleMinMax, MAX_RENDER_POINTS } from '@/utils/downsampling';

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

export const FastChart = ({ data, color, domain = [0, 4096] }: { data: SensorDataPoint[], color: string, domain?: [number | string, number | string] }) => {
  // Performance optimization: only render if data exists
  if (!data || data.length === 0) return <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">NO SIGNAL</div>;

  const sampledData = useMemo(
    () => downsampleMinMax(data, MAX_RENDER_POINTS),
    [data]
  );
  // Recharts may mutate data points in some paths; keep chart input detached.
  const safeData = useMemo(
    () => sampledData.map((point) => ({ timestamp: point.timestamp, value: point.value })),
    [sampledData]
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={safeData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis 
            type="number" 
            dataKey="timestamp" 
            domain={['dataMin', 'dataMax']} 
            hide 
        />
        <YAxis domain={domain} hide />
        <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
            itemStyle={{ color: color }}
            labelStyle={{ display: 'none' }}
        />
        <Line 
            type="linear" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2} 
            dot={false} 
            isAnimationActive={false} 
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export const ValueDisplay = ({ label, value, unit, color = "text-cyan-400" }: { label: string, value: string | number, unit?: string, color?: string }) => (
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
