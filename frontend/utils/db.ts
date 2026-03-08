import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { SensorDataPoint } from '../types';

export const MAX_CHUNK_DURATION_MS = 1000;
const PANDAS_CSV_HEADER = 'timestamp_ms,sensor_id,value';

export interface MeasurementChunk {
  sensorId: string;
  chunkStart: number;
  chunkEnd: number;
  timestamps: Uint32Array;
  values: Float32Array;
}

interface RocketDB extends DBSchema {
  measurements: {
    key: [string, number];
    value: MeasurementChunk;
    indexes: { 'by-sensor': string; 'by-chunk-start': number };
  };
  meta: {
    key: string;
    value: any;
  }
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
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<RocketDB>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<RocketDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (db.objectStoreNames.contains('measurements')) {
          db.deleteObjectStore('measurements');
        }
        if (db.objectStoreNames.contains('meta')) {
          db.deleteObjectStore('meta');
        }

        const store = db.createObjectStore('measurements', { keyPath: ['sensorId', 'chunkStart'] });
        store.createIndex('by-chunk-start', 'chunkStart');
        store.createIndex('by-sensor', 'sensorId');
        db.createObjectStore('meta');
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

export const getMeasurementsInRange = async (sensorId: string, start: number, end: number): Promise<SensorDataPoint[]> => {
  const db = await initDB();
  const queryStart = Math.max(0, start - MAX_CHUNK_DURATION_MS);
  const range = IDBKeyRange.bound([sensorId, queryStart], [sensorId, end]);
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

export const getSensorIds = async (): Promise<string[]> => {
  const db = await initDB();
  const keys = await db.getAllKeys('measurements');
  const sensorIds = new Set<string>();

  for (const key of keys) {
    const sensorId = key[0];
    if (typeof sensorId === 'string' && sensorId.length > 0) {
      sensorIds.add(sensorId);
    }
  }

  return Array.from(sensorIds);
};

export const getMeasurementTimeRange = async (): Promise<{ start: number; end: number }> => {
  const db = await initDB();
  const tx = db.transaction('measurements', 'readonly');
  const index = tx.objectStore('measurements').index('by-chunk-start');
  const firstCursor = await index.openCursor(null, 'next');
  const lastCursor = await index.openCursor(null, 'prev');

  const start = firstCursor ? firstCursor.value.chunkStart : 0;
  const end = lastCursor ? lastCursor.value.chunkEnd : 0;

  return { start, end };
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
  begin,
  end,
  sensorIds,
}: {
  begin: number;
  end: number;
  sensorIds?: string[];
}): Promise<PandasCsvExport> => {
  validateExportRange(begin, end);

  const normalizedBegin = Math.floor(begin);
  const normalizedEnd = Math.ceil(end);
  const requestedSensorIds = normalizeSensorIds(sensorIds);
  const selectedSensorIds = requestedSensorIds.length > 0 ? requestedSensorIds : await getSensorIds();
  const rows: CsvExportRow[] = [];

  for (const sensorId of selectedSensorIds) {
    const points = await getMeasurementsInRange(sensorId, normalizedBegin, normalizedEnd);
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

export const getLastTimestamp = async (): Promise<number> => {
    const db = await initDB();
    const val = await db.get('meta', 'lastTimestamp');
    return val || 0;
}

export const setLastTimestamp = async (ts: number) => {
    const db = await initDB();
    await db.put('meta', ts, 'lastTimestamp');
}

export const getFirstTimestamp = async (): Promise<number> => {
     const db = await initDB();
     const tx = db.transaction('measurements', 'readonly');
     const cursor = await tx.objectStore('measurements').index('by-chunk-start').openCursor(null, 'next');
     if (cursor) {
         return cursor.value.chunkStart;
     }
     return 0;
}

export const clearDB = async () => {
  const db = await initDB();
  const tx = db.transaction(['measurements', 'meta'], 'readwrite');
  await tx.objectStore('measurements').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
};
