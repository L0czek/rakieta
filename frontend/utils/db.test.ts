import { beforeEach, describe, expect, it } from 'vitest';

import {
  addChunks,
  clearDB,
  exportMeasurementsForPandas,
  MeasurementChunk,
} from '@/utils/db';

const buildChunk = (
  sensorId: string,
  chunkStart: number,
  offsetsMs: number[],
  values: number[],
): MeasurementChunk => ({
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

    const result = await exportMeasurementsForPandas({ begin: 1025, end: 1150 });
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
      exportMeasurementsForPandas({ begin: 200, end: 100 }),
    ).rejects.toThrow('Invalid export range');
  });
});
