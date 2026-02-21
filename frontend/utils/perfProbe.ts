type ProbeStat = {
  count: number;
  total: number;
  max: number;
  min: number;
};

const REPORT_INTERVAL_MS = 2000;
const probeStats = new Map<string, ProbeStat>();
let lastReportTs = 0;
let cachedStorageFlag = false;
let cachedStorageCheckTs = 0;
const STORAGE_FLAG_CACHE_MS = 1000;

const getNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const getProbeFlagFromGlobal = (): boolean | null => {
  const globalProbeValue = (globalThis as { __SCADA_PROBE__?: unknown }).__SCADA_PROBE__;
  if (globalProbeValue === true) return true;
  if (globalProbeValue === false) return false;
  return null;
};

const getProbeFlagFromStorage = (): boolean => {
  try {
    return globalThis.localStorage?.getItem('scada.probe') === '1';
  } catch {
    return false;
  }
};

export const isPerfProbeEnabled = (): boolean => {
  const globalFlag = getProbeFlagFromGlobal();
  if (globalFlag !== null) return globalFlag;
  const now = getNow();
  if (now - cachedStorageCheckTs < STORAGE_FLAG_CACHE_MS) return cachedStorageFlag;
  cachedStorageFlag = getProbeFlagFromStorage();
  cachedStorageCheckTs = now;
  return cachedStorageFlag;
};

export const setPerfProbeEnabled = (enabled: boolean): void => {
  try {
    globalThis.localStorage?.setItem('scada.probe', enabled ? '1' : '0');
    cachedStorageFlag = enabled;
    cachedStorageCheckTs = getNow();
  } catch {
    return;
  }
};

const getOrCreateStat = (name: string): ProbeStat => {
  const stat = probeStats.get(name);
  if (stat) return stat;
  const next: ProbeStat = {
    count: 0,
    total: 0,
    max: Number.NEGATIVE_INFINITY,
    min: Number.POSITIVE_INFINITY,
  };
  probeStats.set(name, next);
  return next;
};

const maybeReport = (): void => {
  if (!isPerfProbeEnabled() || probeStats.size === 0) return;

  const now = getNow();
  if (now - lastReportTs < REPORT_INTERVAL_MS) return;
  lastReportTs = now;

  const rows = Array.from(probeStats.entries())
    .map(([name, stat]) => {
      const avg = stat.count > 0 ? stat.total / stat.count : 0;
      return {
        probe: name,
        count: stat.count,
        avgMs: Number(avg.toFixed(3)),
        maxMs: Number((stat.max === Number.NEGATIVE_INFINITY ? 0 : stat.max).toFixed(3)),
        minMs: Number((stat.min === Number.POSITIVE_INFINITY ? 0 : stat.min).toFixed(3)),
        totalMs: Number(stat.total.toFixed(3)),
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);

  console.groupCollapsed(`[SCADA probe] ${new Date().toISOString()}`);
  console.table(rows);
  console.groupEnd();
  probeStats.clear();
};

export const probeCount = (name: string, amount: number = 1): void => {
  if (!isPerfProbeEnabled()) return;
  const stat = getOrCreateStat(name);
  stat.count += amount;
  maybeReport();
};

export const probeDuration = (name: string, durationMs: number): void => {
  if (!isPerfProbeEnabled()) return;
  const stat = getOrCreateStat(name);
  stat.count += 1;
  stat.total += durationMs;
  if (durationMs > stat.max) stat.max = durationMs;
  if (durationMs < stat.min) stat.min = durationMs;
  maybeReport();
};

export const withProbe = <T>(name: string, fn: () => T): T => {
  if (!isPerfProbeEnabled()) return fn();
  const start = getNow();
  const result = fn();
  probeDuration(name, getNow() - start);
  return result;
};
