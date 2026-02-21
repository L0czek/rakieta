
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
  // Structure: u12 values compressed. 
  // 2 values -> 3 bytes
  // 1 value -> 2 bytes (if odd remaining)
  // If even values total, there is 1 padding byte at the end (ignored)
  
  let i = 8;
  
  // Process full pairs (3 bytes for 2 values)
  while (i + 3 <= buffer.length) {
    const b0 = buffer[i];
    const b1 = buffer[i + 1];
    const b2 = buffer[i + 2];

    const val1 = (b0 << 4) | (b1 >> 4);
    const val2 = ((b1 & 0x0F) << 8) | b2;

    values.push(val1);
    values.push(val2);

    i += 3;
  }
  
  // Process remaining odd value (2 bytes for 1 value)
  // Check if exactly 2 bytes are left (or more, but logic implies only 2 or 1 byte could remain)
  // Actually if 1 byte remains, it's padding. If 2 bytes remain, it's a value.
  if (i + 2 <= buffer.length) {
      const b0 = buffer[i];
      const b1 = buffer[i + 1];
      
      // val = b0[7:0] << 4 | b1[7:4]
      const val = (b0 << 4) | (b1 >> 4);
      values.push(val);
      i += 2;
  }
  
  // If 1 byte remains here, it is padding, we ignore it.
  
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
