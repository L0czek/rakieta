
/**
 * Parses binary payloads from the ESP32 Rocket Controller.
 */

// Helper to read Little Endian u32
const readU32 = (buffer: Uint8Array, offset: number): number => {
  return (
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24)
  ) >>> 0; // unsigned shift
};

// Helper to read Little Endian u16
const readU16 = (buffer: Uint8Array, offset: number): number => {
  return (buffer[offset] | (buffer[offset + 1] << 8));
};

export const parseFastAdc = (buffer: Uint8Array): { timestampStart: number, timestampEnd: number, values: number[] } => {
  if (buffer.length < 8) return { timestampStart: 0, timestampEnd: 0, values: [] };

  const timestampStart = readU32(buffer, 0);
  const timestampEnd = readU32(buffer, 4);
  const values: number[] = [];

  // Data starts at offset 8
  // - each pair of samples is encoded in 3 bytes:
  //   b0 = first[7:0]
  //   b1 = first[11:8] | (second[3:0] << 4)
  //   b2 = second[11:4]
  // - odd trailing sample is encoded in 2 bytes:
  //   b0 = sample[7:0]
  //   b1 = sample[11:8]

  let i = 8;

  // Process full pairs (3 bytes for 2 values)
  while (i + 3 <= buffer.length) {
    const b0 = buffer[i];
    const b1 = buffer[i + 1];
    const b2 = buffer[i + 2];

    const val1 = b0 | ((b1 & 0x0F) << 8);
    const val2 = ((b1 >> 4) & 0x0F) | (b2 << 4);

    values.push(val1);
    values.push(val2);

    i += 3;
  }

  // Decode trailing odd sample (if present).
  if (i + 2 === buffer.length) {
      const b0 = buffer[i];
      const b1 = buffer[i + 1];

      const val = b0 | ((b1 & 0x0F) << 8);
      values.push(val);
  }

  return { timestampStart, timestampEnd, values };
};

export const parseSlowAdc = (buffer: Uint8Array): { timestamp: number, value: number } => {
  if (buffer.length < 6) return { timestamp: 0, value: 0 };
  const timestamp = readU32(buffer, 0);
  const value = readU16(buffer, 4);
  return { timestamp, value };
};

export const parseDigital = (buffer: Uint8Array): { timestamp: number, value: number } => {
  if (buffer.length < 5) return { timestamp: 0, value: 0 };
  const timestamp = readU32(buffer, 0);
  const value = buffer[4]; // u8
  return { timestamp, value };
};

export const parseTemp = (buffer: Uint8Array): { timestamp: number, values: number[] } => {
    if (buffer.length < 4) return { timestamp: 0, values: [] };
    
    const timestamp = readU32(buffer, 0);
    const values: number[] = [];
    
    // Prompt says: "Timestamp + value (u14) * n"
    // Value is signed 14-bit integer.
    
    let i = 4;
    while (i + 1 < buffer.length) {
        const raw = readU16(buffer, i);
        
        // Extract 14 bits
        let val = raw & 0x3FFF;

        // Check sign bit (bit 13, 0x2000) for Two's complement in 14-bit space
        // If bit 13 is 1, it's negative. Subtract 2^14 (16384) to get negative value.
        if (val & 0x2000) {
            val = val - 16384; 
        }

        values.push(val);
        i += 2;
    }

    return { timestamp, values };
};

export const parseServo = (buffer: Uint8Array): { timestamp: number, value: number } => {
    if (buffer.length < 6) return { timestamp: 0, value: 0 };
    const timestamp = readU32(buffer, 0);
    const value = readU16(buffer, 4);
    return { timestamp, value };
}
