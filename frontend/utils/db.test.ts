import { beforeEach, describe, expect, it } from 'vitest';

import {
  addChunks,
  clearDB,
  exportMeasurementsForPandas,
  getMeasurementsInRange,
  getSensorIds,
  listBoots,
  MeasurementChunk,
  registerBoot,
} from '@/utils/db';

const buildChunk = (
  sensorId: string,
  chunkStart: number,
  offsetsMs: number[],
  values: number[],
  bootId = 1,
): MeasurementChunk => ({
  bootId,
  sensorId,
  chunkStart,
  chunkEnd: chunkStart + offsetsMs[offsetsMs.length - 1],
  timestamps: Uint32Array.from(offsetsMs),
  values: Float32Array.from(values),
});

describe('db pandas export', () => {
  beforeEach(async () => {
    await clearDB();
  });

  it('exports tidy CSV rows filtered by begin/end', async () => {
    await addChunks([
      buildChunk('sensorA', 1000, [0, 50, 150], [1, 2, 3]),
      buildChunk('sensorB', 1050, [0, 100], [4, 5]),
    ]);

    const result = await exportMeasurementsForPandas({ bootId: 1, begin: 1025, end: 1150 });
    const expectedCsv = [
      'timestamp_ms,sensor_id,value',
      '1050,sensorA,2',
      '1050,sensorB,4',
      '1150,sensorA,3',
      '1150,sensorB,5',
    ].join('\n');

    expect(result.csv).toBe(expectedCsv);
    expect(result.rowCount).toBe(4);
    expect(result.sensorCount).toBe(2);
  });

  it('escapes sensor ids that include CSV special characters', async () => {
    await addChunks([buildChunk('temp,"rack"', 10, [0], [12.5])]);

    const result = await exportMeasurementsForPandas({
      bootId: 1,
      begin: 0,
      end: 20,
      sensorIds: ['temp,"rack"'],
    });

    expect(result.csv).toContain('10,"temp,""rack""",12.5');
    expect(result.rowCount).toBe(1);
    expect(result.sensorCount).toBe(1);
  });

  it('fails fast for invalid begin/end range', async () => {
    await expect(
      exportMeasurementsForPandas({ bootId: 1, begin: 200, end: 100 }),
    ).rejects.toThrow('Invalid export range');
  });
});

describe('db controller boots', () => {
  beforeEach(async () => {
    await clearDB();
  });

  it('keeps samples with the same controller time apart per boot', async () => {
    await addChunks([
      buildChunk('tensometer', 1000, [0, 100], [1, 2], 1),
      buildChunk('tensometer', 1000, [0, 100], [8, 9], 2),
    ]);

    expect(await getMeasurementsInRange(1, 'tensometer', 0, 5000)).toEqual([
      { timestamp: 1000, value: 1 },
      { timestamp: 1100, value: 2 },
    ]);
    expect(await getMeasurementsInRange(2, 'tensometer', 0, 5000)).toEqual([
      { timestamp: 1000, value: 8 },
      { timestamp: 1100, value: 9 },
    ]);
  });

  it('lists sensors and exports rows of one boot only', async () => {
    await addChunks([
      buildChunk('tensometer', 1000, [0], [1], 1),
      buildChunk('pressureTank', 1000, [0], [40], 2),
    ]);

    expect(await getSensorIds(1)).toEqual(['tensometer']);
    expect(await getSensorIds(2)).toEqual(['pressureTank']);

    const result = await exportMeasurementsForPandas({ bootId: 2, begin: 0, end: 5000 });
    expect(result.csv).toBe(['timestamp_ms,sensor_id,value', '1000,pressureTank,40'].join('\n'));
  });

  it('summarises boots with the time range of their samples', async () => {
    await registerBoot({ id: 1, firstSeenAtWall: 111 });
    await registerBoot({ id: 2, firstSeenAtWall: 222 });
    await addChunks([
      buildChunk('tensometer', 5000, [0, 900], [1, 2], 1),
      buildChunk('tensometer', 6000, [0, 500], [3, 4], 1),
    ]);

    expect(await listBoots()).toEqual([
      { id: 1, firstSeenAtWall: 111, start: 5000, end: 6500 },
      { id: 2, firstSeenAtWall: 222, start: 0, end: 0 },
    ]);
  });
});
