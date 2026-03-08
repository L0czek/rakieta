export const CHART_COLORS = {
  axis: '#8fa3be',
  grid: '#334155',
  accent: '#22d3ee',
} as const;

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

export const TEMP_COLORS = ['#f87171', '#fda4af', '#e11d48', '#be123c'] as const;
