const tokenValue = (tokenName: string, fallback: string): string => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  return value.length > 0 ? value : fallback;
};

export const CHART_COLORS = {
  axis: tokenValue('--scada-chart-axis', '#8fa3be'),
  grid: tokenValue('--scada-chart-grid', '#334155'),
  accent: tokenValue('--scada-text-accent', '#22d3ee'),
} as const;

export const SENSOR_COLORS: Record<string, string> = {
  tensometer: tokenValue('--scada-series-tensometer', '#c084fc'),
  pressureTank: tokenValue('--scada-series-pressure-tank', '#22d3ee'),
  pressureCombustion: tokenValue('--scada-series-pressure-combustion', '#fb923c'),
  batteryStand: tokenValue('--scada-series-battery-stand', '#4ade80'),
  batteryComputer: tokenValue('--scada-series-battery-computer', '#2dd4bf'),
  boostVoltage: tokenValue('--scada-series-boost-voltage', '#fbbf24'),
  starterSense: tokenValue('--scada-series-starter-sense', '#a78bfa'),
  servo: tokenValue('--scada-series-servo', '#f472b6'),
};

export const TEMP_COLORS = [
  tokenValue('--scada-series-temp-1', '#f87171'),
  tokenValue('--scada-series-temp-2', '#fda4af'),
  tokenValue('--scada-series-temp-3', '#e11d48'),
  tokenValue('--scada-series-temp-4', '#be123c'),
] as const;
