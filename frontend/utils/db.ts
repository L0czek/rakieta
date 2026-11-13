import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { SensorDataPoint } from '../types';

export const MAX_CHUNK_DURATION_MS = 1000;
const PANDAS_CSV_HEADER = 'timestamp_ms,sensor_id,value';

export interface MeasurementChunk {
  /** Controller boot the samples belong to; controller timestamps restart at every boot. */
  bootId: number;
  sensorId: string;
  chunkStart: number;
  chunkEnd: number;
  timestamps: Uint32Array;
  values: Float32Array;
}

export interface BootRecord {
  id: number;
  /** Wall-clock time (ms since epoch) at which this browser first saw the boot. */
  firstSeenAtWall: number;
}

export interface BootSummary extends BootRecord {
  /** Controller time range of the stored samples, in ms; both 0 when the boot has none. */
  start: number;
  end: number;
}

interface RocketDB extends DBSchema {
  measurements: {
    key: [number, string, number];
    value: MeasurementChunk;
    indexes: { 'by-boot-chunk-start': [number, number] };
  };
  boots: {
    key: number;
    value: BootRecord;
  };
}

interface CsvExportRow {
  timestamp: number;
  sensorId: string;
  value: number;
}

export interface PandasCsvExport {
  csv: string;
  rowCount: number;
  sensorCount: number;
}

const DB_NAME = 'rocket_telemetry_db';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<RocketDB>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<RocketDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Older layouts kept a single time axis and cannot be split into boots; start over.
        for (const name of Array.from(db.objectStoreNames)) {
          db.deleteObjectStore(name);
        }

        const store = db.createObjectStore('measurements', {
          keyPath: ['bootId', 'sensorId', 'chunkStart'],
        });
        store.createIndex('by-boot-chunk-start', ['bootId', 'chunkStart']);
        db.createObjectStore('boots', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
};

export const addChunks = async (chunks: MeasurementChunk[]) => {
  if (chunks.length === 0) return;

  const db = await initDB();
  const tx = db.transaction('measurements', 'readwrite');
  const store = tx.objectStore('measurements');

  for (const chunk of chunks) {
    void store.put(chunk);
  }

  await tx.done;
};

export const getMeasurementsInRange = async (
  bootId: number,
  sensorId: string,
  start: number,
  end: number,
): Promise<SensorDataPoint[]> => {
  const db = await initDB();
  const queryStart = Math.max(0, start - MAX_CHUNK_DURATION_MS);
  const range = IDBKeyRange.bound([bootId, sensorId, queryStart], [bootId, sensorId, end]);
  const chunks = await db.getAll('measurements', range);
  const points: SensorDataPoint[] = [];

  for (const chunk of chunks) {
    const len = Math.min(chunk.timestamps.length, chunk.values.length);
    for (let i = 0; i < len; i += 1) {
      const timestamp = chunk.chunkStart + chunk.timestamps[i];
      if (timestamp < start || timestamp > end) continue;
      points.push({ timestamp, value: chunk.values[i] });
    }
  }

  return points;
};

export const getSensorIds = async (bootId: number): Promise<string[]> => {
  const db = await initDB();
  // An array key sorts after every string, so [bootId, []] is past the boot's last sensor.
  const range = IDBKeyRange.bound([bootId], [bootId, []]);
  const keys = await db.getAllKeys('measurements', range);
  const sensorIds = new Set<string>();

  for (const key of keys) {
    const sensorId = key[1];
    if (typeof sensorId === 'string' && sensorId.length > 0) {
      sensorIds.add(sensorId);
    }
  }

  return Array.from(sensorIds);
};

export const getMeasurementTimeRange = async (
  bootId: number,
): Promise<{ start: number; end: number }> => {
  const db = await initDB();
  const tx = db.transaction('measurements', 'readonly');
  const index = tx.objectStore('measurements').index('by-boot-chunk-start');
  const range = IDBKeyRange.bound([bootId, -Infinity], [bootId, Infinity]);
  const firstCursor = await index.openCursor(range, 'next');
  const lastCursor = await index.openCursor(range, 'prev');

  const start = firstCursor ? firstCursor.value.chunkStart : 0;
  const end = lastCursor ? lastCursor.value.chunkEnd : 0;

  return { start, end };
};

export const registerBoot = async (boot: BootRecord): Promise<void> => {
  const db = await initDB();
  await db.put('boots', boot);
};

/** Boots known to this browser, oldest first, with the time range of their stored samples. */
export const listBoots = async (): Promise<BootSummary[]> => {
  const db = await initDB();
  const boots = await db.getAll('boots');
  const summaries: BootSummary[] = [];

  for (const boot of boots) {
    const range = await getMeasurementTimeRange(boot.id);
    summaries.push({ ...boot, ...range });
  }

  return summaries;
};

const validateExportRange = (begin: number, end: number): void => {
  if (!Number.isFinite(begin) || !Number.isFinite(end)) {
    throw new Error('Invalid export range: begin/end must be finite numbers.');
  }
  if (begin > end) {
    throw new Error(`Invalid export range: begin (${begin}) must be <= end (${end}).`);
  }
};

const escapeCsvField = (field: string): string => {
  if (/["\n,]/.test(field)) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
};

const normalizeSensorIds = (sensorIds: string[] | undefined): string[] => {
  if (!sensorIds) return [];
  const uniqueIds = new Set<string>();

  for (const sensorId of sensorIds) {
    const trimmed = sensorId.trim();
    if (trimmed.length > 0) {
      uniqueIds.add(trimmed);
    }
  }

  return Array.from(uniqueIds);
};

const buildCsvLine = (row: CsvExportRow): string =>
  `${row.timestamp},${escapeCsvField(row.sensorId)},${row.value}`;

export const exportMeasurementsForPandas = async ({
  bootId,
  begin,
  end,
  sensorIds,
}: {
  bootId: number;
  begin: number;
  end: number;
  sensorIds?: string[];
}): Promise<PandasCsvExport> => {
  validateExportRange(begin, end);

  const normalizedBegin = Math.floor(begin);
  const normalizedEnd = Math.ceil(end);
  const requestedSensorIds = normalizeSensorIds(sensorIds);
  const selectedSensorIds =
    requestedSensorIds.length > 0 ? requestedSensorIds : await getSensorIds(bootId);
  const rows: CsvExportRow[] = [];

  for (const sensorId of selectedSensorIds) {
    const points = await getMeasurementsInRange(bootId, sensorId, normalizedBegin, normalizedEnd);
    for (const point of points) {
      if (!Number.isFinite(point.value)) continue;
      rows.push({ timestamp: point.timestamp, sensorId, value: point.value });
    }
  }

  rows.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    return left.sensorId.localeCompare(right.sensorId);
  });

  const lines = [PANDAS_CSV_HEADER, ...rows.map(buildCsvLine)];
  return {
    csv: lines.join('\n'),
    rowCount: rows.length,
    sensorCount: selectedSensorIds.length,
  };
};

export const clearDB = async () => {
  const db = await initDB();
  const tx = db.transaction(['measurements', 'boots'], 'readwrite');
  await tx.objectStore('measurements').clear();
  await tx.objectStore('boots').clear();
  await tx.done;
};
