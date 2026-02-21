/**
 * Physical Unit Conversions and ADC Correction
 */

// --- ADC CORRECTION (ESP32 LUT) ---

// Typical ESP32 ADC Non-linearity LUT (Piecewise Linear)
// Maps Raw ADC (0-4095) -> Corrected Voltage (mV)
// Based on generic ESP32 calibration curves (attenuation 11dB, approx 0-3.3V)
// X: Raw Reading, Y: Voltage in mV
const ADC_LUT = [
    { x: 0, y: 0 },
    { x: 100, y: 82 }, // Lower end non-linearity
    { x: 500, y: 405 },
    { x: 1000, y: 810 },
    { x: 1500, y: 1215 },
    { x: 2000, y: 1620 },
    { x: 2500, y: 2025 },
    { x: 3000, y: 2430 },
    { x: 3500, y: 2835 },
    { x: 4000, y: 3200 }, // Saturation approach
    { x: 4095, y: 3300 }
];

/**
 * Converts a raw ESP32 ADC reading (0-4095) to Voltage (Volts)
 * using piecewise linear interpolation from the LUT.
 */
export const correctAdcToVoltage = (raw: number): number => {
    // Clamp
    if (raw <= 0) return 0;
    if (raw >= 4095) return 3.3;

    // Find segment
    for (let i = 0; i < ADC_LUT.length - 1; i++) {
        const p1 = ADC_LUT[i];
        const p2 = ADC_LUT[i+1];
        
        if (raw >= p1.x && raw <= p2.x) {
            // Linear interpolation: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
            const mV = p1.y + (raw - p1.x) * (p2.y - p1.y) / (p2.x - p1.x);
            return mV / 1000.0; // Return Volts
        }
    }
    return 0;
};

// --- SENSOR MAPPINGS ---

// Constants for sensor calibration (Adjust based on actual hardware)
const TENSOMETER_SCALE_KG_PER_V = 200.0; // Example: 200kg per 1 Volt (with amplifier)
const PRESSURE_SCALE_BAR_PER_V = 40.0;   // Example: 40 bar per 1 Volt
const VOLTAGE_DIVIDER_RATIO = 5.7;       // Example: 47k/10k divider -> V_in = V_adc * (R1+R2)/R2

export const rawToThrustKg = (raw: number): number => {
    const v = correctAdcToVoltage(raw);
    return v * TENSOMETER_SCALE_KG_PER_V;
};

export const rawToPressureBar = (raw: number): number => {
    const v = correctAdcToVoltage(raw);
    return v * PRESSURE_SCALE_BAR_PER_V;
};

export const rawToBatteryVoltage = (raw: number): number => {
    const v = correctAdcToVoltage(raw);
    return v * VOLTAGE_DIVIDER_RATIO;
};

export const rawToGenericVoltage = (raw: number): number => {
    return correctAdcToVoltage(raw);
};

export const rawServoToPercent = (raw: number): number => {
    if (raw <= 0) return 0;
    // Assuming 2000 is max open based on topic description "2000=100%"
    if (raw >= 2000) return 100;
    return (raw / 2000) * 100;
};

// --- TEMPERATURE ---

/**
 * Converts signed 14-bit integer to Celsius.
 * Factor: 1 LSB = 0.015625 °C
 */
export const rawTempToCelsius = (rawSigned: number): number => {
    return rawSigned * 0.015625;
};
