import { SensorDataPoint } from '@/types';

export const MAX_RENDER_POINTS = 1000;

export const downsampleMinMax = (
  points: SensorDataPoint[],
  maxPoints: number = MAX_RENDER_POINTS
): SensorDataPoint[] => {
  const total = points.length;
  if (maxPoints <= 0 || total === 0) return [];
  if (total <= maxPoints) return points;
  if (maxPoints === 1) return [points[total - 1]];

  const first = points[0];
  const last = points[total - 1];
  if (maxPoints === 2) return [first, last];
  if (maxPoints === 3) {
    const middleIndex = Math.floor((total - 1) / 2);
    return [first, points[middleIndex], last];
  }

  const availableSlots = maxPoints - 2;
  const interiorStart = 1;
  const interiorEnd = total - 1;
  const interiorLength = interiorEnd - interiorStart;
  if (interiorLength <= 0) return [first, last];

  const bucketCount = Math.max(1, Math.floor(availableSlots / 2));
  const bucketSize = interiorLength / bucketCount;
  const sampled: SensorDataPoint[] = [first];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(interiorStart + bucket * bucketSize);
    const end = Math.floor(interiorStart + (bucket + 1) * bucketSize);
    const nextEnd = bucket === bucketCount - 1 ? interiorEnd : end;
    if (start >= nextEnd) continue;

    let minIndex = start;
    let maxIndex = start;
    for (let i = start + 1; i < nextEnd; i += 1) {
      if (points[i].value < points[minIndex].value) minIndex = i;
      if (points[i].value > points[maxIndex].value) maxIndex = i;
    }

    if (minIndex === maxIndex) {
      sampled.push(points[minIndex]);
      continue;
    }

    if (minIndex < maxIndex) {
      sampled.push(points[minIndex], points[maxIndex]);
    } else {
      sampled.push(points[maxIndex], points[minIndex]);
    }
  }

  if (sampled.length < maxPoints) sampled.push(last);
  return sampled;
};
