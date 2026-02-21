
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
    // Odd remaining (1 value) -> 2 bytes
    // If total count is EVEN, add 1 padding byte (0x00)
    
    const count = values.length;
    const pairs = Math.floor(count / 2);
    const odd = count % 2;
    
    let dataSize = pairs * 3;
    if (odd) {
        dataSize += 2;
    } else {
        // Spec: "padding must always exist" if even multiple
        dataSize += 1;
    }

    const buffer = new Uint8Array(8 + dataSize);
    const view = new DataView(buffer.buffer);

    writeU32(view, 0, timestampStart);
    writeU32(view, 4, timestampEnd);

    let offset = 8;
    for (let i = 0; i < count - odd; i += 2) {
        const v1 = Math.max(0, Math.min(4095, Math.floor(values[i])));
        const v2 = (i + 1 < values.length) 
            ? Math.max(0, Math.min(4095, Math.floor(values[i + 1]))) 
            : 0;

        // Compression:
        // Byte 0: v1[11:4]
        // Byte 1: v1[3:0] << 4 | v2[11:8]
        // Byte 2: v2[7:0]

        buffer[offset] = (v1 >> 4) & 0xFF;
        buffer[offset + 1] = ((v1 & 0x0F) << 4) | ((v2 >> 8) & 0x0F);
        buffer[offset + 2] = v2 & 0xFF;

        offset += 3;
    }

    // Handle odd value
    if (odd) {
        const v = Math.max(0, Math.min(4095, Math.floor(values[count - 1])));
        // 12 bits in 2 bytes
        // B0: v[11:4]
        // B1: v[3:0] << 4
        buffer[offset] = (v >> 4) & 0xFF;
        buffer[offset + 1] = (v & 0x0F) << 4;
        offset += 2;
    } else {
        // Add padding byte for even count
        buffer[offset] = 0x00;
        offset += 1;
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

export const buildTempPacket = (timestamp: number, values: number[]): Uint8Array => {
    // Header: 4 bytes timestamp
    // Data: 2 bytes per value (14-bit signed)
    const buffer = new Uint8Array(4 + values.length * 2);
    const view = new DataView(buffer.buffer);
    
    writeU32(view, 0, timestamp);
    
    let offset = 4;
    for (const val of values) {
        // Convert Celsius back to Raw 14-bit
        // Factor: 1 LSB = 0.015625 °C => Raw = Celsius / 0.015625
        let raw = Math.round(val / 0.015625);
        
        // Handle signed 14-bit (Two's complement logic in 14 bits)
        // If negative, we essentially look for the 14-bit representation
        if (raw < 0) {
            raw = (1 << 14) + raw; // e.g. -1 becomes 0x3FFF
        }
        
        // Mask to 14 bits just in case
        raw = raw & 0x3FFF;
        
        // Write as U16 (since it fits)
        writeU16(view, offset, raw);
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
