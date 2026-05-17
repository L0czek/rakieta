import { describe, expect, it } from 'vitest';

import { parseCpuIdleMetric, parseWifiRssiMetric } from '@/utils/parser';

describe('metric parsers', () => {
  it('parses retained CPU idle permille payloads', () => {
    expect(parseCpuIdleMetric(new Uint8Array([0xe8, 0x03]))).toBe(1000);
    expect(parseCpuIdleMetric(new Uint8Array([0x20, 0x03]))).toBe(800);
  });

  it('parses signed WiFi RSSI dBm payloads', () => {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setInt32(0, -67, true);

    expect(parseWifiRssiMetric(payload)).toBe(-67);
  });

  it('ignores incomplete metric payloads', () => {
    expect(parseCpuIdleMetric(new Uint8Array([0x01]))).toBeNull();
    expect(parseWifiRssiMetric(new Uint8Array([0x01, 0x02, 0x03]))).toBeNull();
  });
});
