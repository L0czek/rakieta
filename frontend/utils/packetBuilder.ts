
/**
 * Constructs binary payloads for the Rocket Simulator
 * strictly matching the parsing logic in utils/parser.ts
 */

const writeU32 = (view: DataView, offset: number, val: number) => {
    view.setUint32(offset, val, true); // Little Endian
};

const writeU16 = (view: DataView, offset: number, val: number) => {
    view.setUint16(offset, val, true); // Little Endian
};

export const buildFastAdcPacket = (timestampStart: number, timestampEnd: number, values: number[]): Uint8Array => {
    // Header: 4 bytes start + 4 bytes end = 8 bytes
    // Data:
    // Pairs (2 values) -> 3 bytes
    // Odd trailing value (1 value) -> 2 bytes
    
    const count = values.length;
    const pairCount = Math.floor(count / 2);
    const dataSize = (pairCount * 3) + (count % 2 === 1 ? 2 : 0);

    const buffer = new Uint8Array(8 + dataSize);
    const view = new DataView(buffer.buffer);

    writeU32(view, 0, timestampStart);
    writeU32(view, 4, timestampEnd);

    let offset = 8;
    for (let i = 0; i + 1 < count; i += 2) {
        const v1 = Math.max(0, Math.min(4095, Math.floor(values[i])));
        const v2 = Math.max(0, Math.min(4095, Math.floor(values[i + 1])));

        // Compression:
        // Byte 0: v1[7:0]
        // Byte 1: v1[11:8] | (v2[3:0] << 4)
        // Byte 2: v2[11:4]

        buffer[offset] = v1 & 0xFF;
        buffer[offset + 1] = ((v1 >> 8) & 0x0F) | ((v2 & 0x0F) << 4);
        buffer[offset + 2] = (v2 >> 4) & 0xFF;

        offset += 3;
    }

    // Write trailing odd sample (if any).
    if (count % 2 === 1) {
        const v = Math.max(0, Math.min(4095, Math.floor(values[count - 1])));
        buffer[offset] = v & 0xFF;
        buffer[offset + 1] = (v >> 8) & 0x0F;
    }

    return buffer;
};

export const buildSlowAdcPacket = (timestamp: number, value: number): Uint8Array => {
    const buffer = new Uint8Array(6);
    const view = new DataView(buffer.buffer);
    writeU32(view, 0, timestamp);
    writeU16(view, 4, Math.max(0, Math.min(65535, Math.floor(value))));
    return buffer;
};

export const buildDigitalPacket = (timestamp: number, value: boolean): Uint8Array => {
    const buffer = new Uint8Array(5);
    const view = new DataView(buffer.buffer);
    writeU32(view, 0, timestamp);
    buffer[4] = value ? 1 : 0;
    return buffer;
};

export const buildTempPacket = (timestampStart: number, timestampEnd: number, values: number[]): Uint8Array => {
    // Header: 4 bytes timestampStart + 4 bytes timestampEnd
    // Data: 2 bytes per value (left-aligned signed 14-bit)
    const buffer = new Uint8Array(8 + values.length * 2);
    const view = new DataView(buffer.buffer);

    writeU32(view, 0, timestampStart);
    writeU32(view, 4, timestampEnd);

    let offset = 8;
    for (const val of values) {
        // Convert Celsius back to Raw 14-bit
        // Factor: 1 LSB = 0.015625 °C => Raw = Celsius / 0.015625
        let raw = Math.round(val / 0.015625);
        
        // Handle signed 14-bit (Two's complement logic in 14 bits)
        // If negative, we essentially look for the 14-bit representation
        if (raw < 0) {
            raw = (1 << 14) + raw; // e.g. -1 becomes 0x3FFF
        }
        
        // Mask to 14 bits and store left-aligned in 16-bit word.
        raw = raw & 0x3FFF;
        const word = (raw << 2) & 0xFFFC;

        writeU16(view, offset, word);
        offset += 2;
    }
    
    return buffer;
};

export const buildServoPacket = (timestamp: number, value: number): Uint8Array => {
    const buffer = new Uint8Array(6);
    const view = new DataView(buffer.buffer);
    writeU32(view, 0, timestamp);
    writeU16(view, 4, Math.max(0, Math.min(65535, Math.floor(value))));
    return buffer;
};
