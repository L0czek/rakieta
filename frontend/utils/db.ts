import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { SensorDataPoint } from '../types';

interface RocketDB extends DBSchema {
  measurements: {
    key: string; // composite key: timestamp_sensorId
    value: {
      timestamp: number;
      sensorId: string;
      value: number;
    };
    indexes: { 'by-sensor': string; 'by-timestamp': number };
  };
  meta: {
    key: string;
    value: any;
  }
}

const DB_NAME = 'rocket_telemetry_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RocketDB>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<RocketDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('measurements', { keyPath: ['sensorId', 'timestamp'] });
        store.createIndex('by-timestamp', 'timestamp');
        store.createIndex('by-sensor', 'sensorId');
        
        db.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
};

export const addMeasurements = async (sensorId: string, points: SensorDataPoint[]) => {
  const db = await initDB();
  const tx = db.transaction('measurements', 'readwrite');
  const store = tx.objectStore('measurements');
  
  for (const p of points) {
      void store.put({
          sensorId,
          timestamp: p.timestamp,
          value: p.value
      });
  }
  await tx.done;
};

export const getMeasurementsInRange = async (sensorId: string, start: number, end: number): Promise<SensorDataPoint[]> => {
  const db = await initDB();
  const range = IDBKeyRange.bound([sensorId, start], [sensorId, end]);
  const results = await db.getAll('measurements', range);
  return results.map(r => ({ timestamp: r.timestamp, value: r.value }));
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
     const cursor = await tx.objectStore('measurements').index('by-timestamp').openCursor(null, 'next');
     if (cursor) {
         return cursor.value.timestamp;
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
