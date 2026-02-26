/**
 * Physical Unit Conversions and ADC Correction
 */

export type AnalogChannel =
    | 'tensometer'
    | 'pressureTank'
    | 'pressureCombustion'
    | 'batteryStand'
    | 'batteryComputer'
    | 'boostVoltage'
    | 'starterSense';

export interface LutPoint {
    x: number;
    y: number;
}

export interface ConversionSettings {
    lutByChannel: Record<AnalogChannel, LutPoint[]>;
    tensometerDividerRatio: number;
    tensometerKgPerV: number;
    pressureDividerRatio: {
        pressureTank: number;
        pressureCombustion: number;
    };
    pressureScaleBarPerV: {
        pressureTank: number;
        pressureCombustion: number;
    };
    voltageDividerRatio: {
        batteryStand: number;
        batteryComputer: number;
        boostVoltage: number;
        starterSense: number;
    };
}

// --- ADC CORRECTION (ESP32 LUT) ---

// Default linear LUT
// Maps Raw ADC (0-4095) -> Corrected Voltage (mV)
// X: Raw Reading, Y: Voltage in mV
const ADC_LUT: LutPoint[] = [
    { x: 0, y: 0 },
    { x: 4095, y: 1000 }
];

const CONVERSION_SETTINGS_STORAGE_KEY = 'rocket.conversions.settings';

const cloneLut = (lut: LutPoint[]): LutPoint[] => lut.map(point => ({ ...point }));

const getDefaultLuts = (): Record<AnalogChannel, LutPoint[]> => ({
    tensometer: cloneLut(ADC_LUT),
    pressureTank: cloneLut(ADC_LUT),
    pressureCombustion: cloneLut(ADC_LUT),
    batteryStand: cloneLut(ADC_LUT),
    batteryComputer: cloneLut(ADC_LUT),
    boostVoltage: cloneLut(ADC_LUT),
    starterSense: cloneLut(ADC_LUT),
});

export const getDefaultConversionSettings = (): ConversionSettings => ({
    lutByChannel: getDefaultLuts(),
    tensometerDividerRatio: 4.774,
    tensometerKgPerV: 200.0,
    pressureDividerRatio: {
        pressureTank: 3.1,
        pressureCombustion: 3.129,
    },
    pressureScaleBarPerV: {
        pressureTank: 40.0,
        pressureCombustion: 40.0,
    },
    voltageDividerRatio: {
        batteryStand: 14.316,
        batteryComputer: 5.624,
        boostVoltage: 13.717,
        starterSense: 3.136,
    },
});

const deepCloneSettings = (settings: ConversionSettings): ConversionSettings => ({
    lutByChannel: {
        tensometer: cloneLut(settings.lutByChannel.tensometer),
        pressureTank: cloneLut(settings.lutByChannel.pressureTank),
        pressureCombustion: cloneLut(settings.lutByChannel.pressureCombustion),
        batteryStand: cloneLut(settings.lutByChannel.batteryStand),
        batteryComputer: cloneLut(settings.lutByChannel.batteryComputer),
        boostVoltage: cloneLut(settings.lutByChannel.boostVoltage),
        starterSense: cloneLut(settings.lutByChannel.starterSense),
    },
    tensometerDividerRatio: settings.tensometerDividerRatio,
    tensometerKgPerV: settings.tensometerKgPerV,
    pressureDividerRatio: { ...settings.pressureDividerRatio },
    pressureScaleBarPerV: { ...settings.pressureScaleBarPerV },
    voltageDividerRatio: { ...settings.voltageDividerRatio },
});

const channelList: AnalogChannel[] = [
    'tensometer',
    'pressureTank',
    'pressureCombustion',
    'batteryStand',
    'batteryComputer',
    'boostVoltage',
    'starterSense',
];

const sanitizeLut = (candidate: unknown, fallback: LutPoint[]): LutPoint[] => {
    if (!Array.isArray(candidate)) return cloneLut(fallback);

    const normalized = candidate
        .map((point) => {
            if (!point || typeof point !== 'object') return null;
            const rawX = Number((point as any).x);
            const rawY = Number((point as any).y);
            if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
            const x = Math.max(0, Math.min(4095, rawX));
            const y = Math.max(0, Math.min(1500, rawY));
            return { x, y };
        })
        .filter((point): point is LutPoint => point !== null)
        .sort((a, b) => a.x - b.x);

    if (normalized.length < 2) return cloneLut(fallback);
    return normalized;
};

const sanitizeSettings = (candidate: unknown): ConversionSettings => {
    const defaults = getDefaultConversionSettings();
    if (!candidate || typeof candidate !== 'object') return defaults;

    const source = candidate as any;

    const lutByChannel = getDefaultLuts();
    const sourceLutByChannel = source.lutByChannel && typeof source.lutByChannel === 'object' ? source.lutByChannel : {};
    channelList.forEach((channel) => {
        lutByChannel[channel] = sanitizeLut(sourceLutByChannel[channel], defaults.lutByChannel[channel]);
    });

    const tensometerKgPerV = Number.isFinite(Number(source.tensometerKgPerV))
        ? Math.max(0, Number(source.tensometerKgPerV))
        : defaults.tensometerKgPerV;

    const tensometerDividerRatio = Number.isFinite(Number(source.tensometerDividerRatio))
        ? Math.max(0, Number(source.tensometerDividerRatio))
        : defaults.tensometerDividerRatio;

    const pressureDividerSource = source.pressureDividerRatio && typeof source.pressureDividerRatio === 'object'
        ? source.pressureDividerRatio
        : {};
    const pressureDividerRatio = {
        pressureTank: Number.isFinite(Number(pressureDividerSource.pressureTank))
            ? Math.max(0, Number(pressureDividerSource.pressureTank))
            : defaults.pressureDividerRatio.pressureTank,
        pressureCombustion: Number.isFinite(Number(pressureDividerSource.pressureCombustion))
            ? Math.max(0, Number(pressureDividerSource.pressureCombustion))
            : defaults.pressureDividerRatio.pressureCombustion,
    };

    const pressureScaleSource = source.pressureScaleBarPerV && typeof source.pressureScaleBarPerV === 'object'
        ? source.pressureScaleBarPerV
        : {};
    const pressureScaleBarPerV = {
        pressureTank: Number.isFinite(Number(pressureScaleSource.pressureTank))
            ? Math.max(0, Number(pressureScaleSource.pressureTank))
            : defaults.pressureScaleBarPerV.pressureTank,
        pressureCombustion: Number.isFinite(Number(pressureScaleSource.pressureCombustion))
            ? Math.max(0, Number(pressureScaleSource.pressureCombustion))
            : defaults.pressureScaleBarPerV.pressureCombustion,
    };

    const dividerSource = source.voltageDividerRatio && typeof source.voltageDividerRatio === 'object'
        ? source.voltageDividerRatio
        : {};
    const voltageDividerRatio = {
        batteryStand: Number.isFinite(Number(dividerSource.batteryStand))
            ? Math.max(0, Number(dividerSource.batteryStand))
            : defaults.voltageDividerRatio.batteryStand,
        batteryComputer: Number.isFinite(Number(dividerSource.batteryComputer))
            ? Math.max(0, Number(dividerSource.batteryComputer))
            : defaults.voltageDividerRatio.batteryComputer,
        boostVoltage: Number.isFinite(Number(dividerSource.boostVoltage))
            ? Math.max(0, Number(dividerSource.boostVoltage))
            : defaults.voltageDividerRatio.boostVoltage,
        starterSense: Number.isFinite(Number(dividerSource.starterSense))
            ? Math.max(0, Number(dividerSource.starterSense))
            : defaults.voltageDividerRatio.starterSense,
    };

    return {
        lutByChannel,
        tensometerDividerRatio,
        tensometerKgPerV,
        pressureDividerRatio,
        pressureScaleBarPerV,
        voltageDividerRatio,
    };
};

const persistSettings = (settings: ConversionSettings) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CONVERSION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const loadSettings = (): ConversionSettings => {
    if (typeof window === 'undefined') return getDefaultConversionSettings();
    try {
        const raw = window.localStorage.getItem(CONVERSION_SETTINGS_STORAGE_KEY);
        if (!raw) return getDefaultConversionSettings();
        const parsed = JSON.parse(raw);
        return sanitizeSettings(parsed);
    } catch {
        return getDefaultConversionSettings();
    }
};

let conversionSettings: ConversionSettings = loadSettings();

export const getConversionSettings = (): ConversionSettings => deepCloneSettings(conversionSettings);

export const setConversionSettings = (nextSettings: ConversionSettings): ConversionSettings => {
    conversionSettings = sanitizeSettings(nextSettings);
    persistSettings(conversionSettings);
    return getConversionSettings();
};

export const resetConversionSettings = (): ConversionSettings => {
    conversionSettings = getDefaultConversionSettings();
    persistSettings(conversionSettings);
    return getConversionSettings();
};

export const importConversionSettingsFromJson = (jsonContent: string): ConversionSettings => {
    const parsed = JSON.parse(jsonContent);
    return setConversionSettings(parsed);
};

export const exportConversionSettingsToJson = (): string => {
    return JSON.stringify(getConversionSettings(), null, 2);
};

/**
 * Converts a raw ESP32 ADC reading (0-4095) to Voltage (Volts)
 * using piecewise linear interpolation from the LUT.
 */
export const correctAdcToVoltage = (raw: number, channel: AnalogChannel): number => {
    const lut = conversionSettings.lutByChannel[channel];
    // Clamp
    if (raw <= 0) return 0;
    if (raw >= 4095) return lut[lut.length - 1].y / 1000.0;

    // Find segment
    for (let i = 0; i < lut.length - 1; i++) {
        const p1 = lut[i];
        const p2 = lut[i+1];
        
        if (raw >= p1.x && raw <= p2.x) {
            // Linear interpolation: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
            const mV = p1.y + (raw - p1.x) * (p2.y - p1.y) / (p2.x - p1.x);
            return mV / 1000.0; // Return Volts
        }
    }
    return 0;
};

// --- SENSOR MAPPINGS ---

export const rawToThrustKg = (raw: number): number => {
    const v = correctAdcToVoltage(raw, 'tensometer');
    return v * conversionSettings.tensometerDividerRatio * conversionSettings.tensometerKgPerV;
};

export const rawToPressureBar = (raw: number, channel: 'pressureTank' | 'pressureCombustion'): number => {
    const v = correctAdcToVoltage(raw, channel);
    return v * conversionSettings.pressureDividerRatio[channel] * conversionSettings.pressureScaleBarPerV[channel];
};

export const rawToVoltage = (raw: number, channel: 'batteryStand' | 'batteryComputer' | 'boostVoltage' | 'starterSense'): number => {
    const v = correctAdcToVoltage(raw, channel);
    return v * conversionSettings.voltageDividerRatio[channel];
};

export const rawToGenericVoltage = (raw: number, channel: AnalogChannel = 'starterSense'): number => {
    return correctAdcToVoltage(raw, channel);
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
