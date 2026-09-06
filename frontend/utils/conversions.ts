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

export type PressureChannel = 'pressureTank' | 'pressureCombustion';

export interface ConversionSettings {
    lutByChannel: Record<AnalogChannel, LutPoint[]>;
    tensometerDividerRatio: number;
    tensometerKgPerV: number;
    pressureDividerRatio: Record<PressureChannel, number>;
    pressureShuntOhms: Record<PressureChannel, number>;
    pressureAmplifierGain: Record<PressureChannel, number>;
    pressureBarPerMa: Record<PressureChannel, number>;
    voltageDividerRatio: {
        batteryStand: number;
        batteryComputer: number;
        boostVoltage: number;
        starterSense: number;
    };
}

export const PRESSURE_LOOP_ZERO_MA = 4;

// --- ADC CORRECTION (ESP32 LUT) ---

// Default linear LUT
// Maps Raw ADC (0-4095) -> Corrected Voltage (mV)
// X: Raw Reading, Y: Voltage in mV
// "Per design the ADC reference voltage is 1100 mV, however the true reference voltage can range from 1000 mV to 1200 mV amongst different ESP32s."
// For our ESP, the factory configuration efuse is set to 1410 at 400mV, which extrapolates to 1162mV, so we use that as the default
const ADC_LUT: LutPoint[] = [
    { x: 0, y: 0 },
    { x: 4095, y: 1162 }
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
    tensometerDividerRatio: 5.047,
    tensometerKgPerV: 43.478,
    pressureDividerRatio: {
        pressureTank: 3.15,
        pressureCombustion: 3.1,
    },
    pressureShuntOhms: {
        pressureTank: 4.7,
        pressureCombustion: 4.7,
    },
    pressureAmplifierGain: {
        pressureTank: 50.0,
        pressureCombustion: 50.0,
    },
    pressureBarPerMa: {
        pressureTank: 10.0,
        pressureCombustion: 10.0,
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
    pressureShuntOhms: { ...settings.pressureShuntOhms },
    pressureAmplifierGain: { ...settings.pressureAmplifierGain },
    pressureBarPerMa: { ...settings.pressureBarPerMa },
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

    const shuntSource = source.pressureShuntOhms && typeof source.pressureShuntOhms === 'object'
        ? source.pressureShuntOhms
        : {};
    const pressureShuntOhms = {
        pressureTank: Number.isFinite(Number(shuntSource.pressureTank)) && Number(shuntSource.pressureTank) > 0
            ? Number(shuntSource.pressureTank)
            : defaults.pressureShuntOhms.pressureTank,
        pressureCombustion: Number.isFinite(Number(shuntSource.pressureCombustion)) && Number(shuntSource.pressureCombustion) > 0
            ? Number(shuntSource.pressureCombustion)
            : defaults.pressureShuntOhms.pressureCombustion,
    };

    const gainSource = source.pressureAmplifierGain && typeof source.pressureAmplifierGain === 'object'
        ? source.pressureAmplifierGain
        : {};
    const pressureAmplifierGain = {
        pressureTank: Number.isFinite(Number(gainSource.pressureTank)) && Number(gainSource.pressureTank) > 0
            ? Number(gainSource.pressureTank)
            : defaults.pressureAmplifierGain.pressureTank,
        pressureCombustion: Number.isFinite(Number(gainSource.pressureCombustion)) && Number(gainSource.pressureCombustion) > 0
            ? Number(gainSource.pressureCombustion)
            : defaults.pressureAmplifierGain.pressureCombustion,
    };

    const barPerMaSource = source.pressureBarPerMa && typeof source.pressureBarPerMa === 'object'
        ? source.pressureBarPerMa
        : {};
    const pressureBarPerMa = {
        pressureTank: Number.isFinite(Number(barPerMaSource.pressureTank))
            ? Math.max(0, Number(barPerMaSource.pressureTank))
            : defaults.pressureBarPerMa.pressureTank,
        pressureCombustion: Number.isFinite(Number(barPerMaSource.pressureCombustion))
            ? Math.max(0, Number(barPerMaSource.pressureCombustion))
            : defaults.pressureBarPerMa.pressureCombustion,
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
        pressureShuntOhms,
        pressureAmplifierGain,
        pressureBarPerMa,
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

const settingsListeners = new Set<(settings: ConversionSettings) => void>();

const notifySettingsListeners = () => {
    const snapshot = getConversionSettings();
    settingsListeners.forEach((cb) => {
        try {
            cb(snapshot);
        } catch (err) {
            console.error('Conversion settings listener threw:', err);
        }
    });
};

export const subscribeToConversionSettings = (
    cb: (settings: ConversionSettings) => void,
): (() => void) => {
    settingsListeners.add(cb);
    return () => {
        settingsListeners.delete(cb);
    };
};

export const getConversionSettings = (): ConversionSettings => deepCloneSettings(conversionSettings);

export const setConversionSettings = (nextSettings: ConversionSettings): ConversionSettings => {
    conversionSettings = sanitizeSettings(nextSettings);
    persistSettings(conversionSettings);
    notifySettingsListeners();
    return getConversionSettings();
};

export const resetConversionSettings = (): ConversionSettings => {
    conversionSettings = getDefaultConversionSettings();
    persistSettings(conversionSettings);
    notifySettingsListeners();
    return getConversionSettings();
};

export const CONVERSION_SETTINGS_MQTT_TOPIC = 'config/conversions/state';
const CONVERSION_SETTINGS_PAYLOAD_VERSION = 1;

export interface ConversionSettingsEnvelope {
    version: number;
    savedAtWall: number;
    settings: ConversionSettings;
}

export const encodeConversionSettingsPayload = (settings: ConversionSettings): string => {
    const envelope: ConversionSettingsEnvelope = {
        version: CONVERSION_SETTINGS_PAYLOAD_VERSION,
        savedAtWall: Date.now(),
        settings: deepCloneSettings(settings),
    };
    return JSON.stringify(envelope);
};

export const decodeConversionSettingsPayload = (payload: string): ConversionSettings | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(payload);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const source = parsed as Record<string, unknown>;
    if (!source.settings || typeof source.settings !== 'object') return null;
    return sanitizeSettings(source.settings);
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

export interface PressureConversionSteps {
    raw: number;
    voltageAtAdc: number;        // V, after LUT
    voltageAtAmpOutput: number;  // V at INA213 output (after un-dividing)
    voltageAcrossShunt: number;  // V across the shunt resistor (after un-gain)
    currentMa: number;           // mA flowing through loop / shunt
    currentAboveZeroMa: number;  // mA - 4 (live-zero subtracted)
    pressureBar: number;         // final
}

const interpolateLut = (raw: number, lut: LutPoint[]): number => {
    if (raw <= 0) return 0;
    if (raw >= 4095) return lut[lut.length - 1].y / 1000.0;
    for (let i = 0; i < lut.length - 1; i++) {
        const p1 = lut[i];
        const p2 = lut[i + 1];
        if (raw >= p1.x && raw <= p2.x) {
            const mV = p1.y + (raw - p1.x) * (p2.y - p1.y) / (p2.x - p1.x);
            return mV / 1000.0;
        }
    }
    return 0;
};

export const computePressureConversionSteps = (
    raw: number,
    channel: PressureChannel,
    settings: ConversionSettings = conversionSettings,
): PressureConversionSteps => {
    const voltageAtAdc = interpolateLut(raw, settings.lutByChannel[channel]);
    const voltageAtAmpOutput = voltageAtAdc * settings.pressureDividerRatio[channel];
    const gain = settings.pressureAmplifierGain[channel];
    const voltageAcrossShunt = gain > 0 ? voltageAtAmpOutput / gain : 0;
    const shunt = settings.pressureShuntOhms[channel];
    const currentMa = shunt > 0 ? (voltageAcrossShunt / shunt) * 1000 : 0;
    const currentAboveZeroMa = currentMa - PRESSURE_LOOP_ZERO_MA;
    const pressureBar = currentAboveZeroMa * settings.pressureBarPerMa[channel];
    return {
        raw,
        voltageAtAdc,
        voltageAtAmpOutput,
        voltageAcrossShunt,
        currentMa,
        currentAboveZeroMa,
        pressureBar,
    };
};

export const rawToPressureBar = (raw: number, channel: PressureChannel): number => {
    return computePressureConversionSteps(raw, channel).pressureBar;
};

export const rawToVoltage = (raw: number, channel: 'batteryStand' | 'batteryComputer' | 'boostVoltage' | 'starterSense'): number => {
    const v = correctAdcToVoltage(raw, channel);
    return v * conversionSettings.voltageDividerRatio[channel];
};

export const rawToGenericVoltage = (raw: number, channel: AnalogChannel = 'starterSense'): number => {
    return correctAdcToVoltage(raw, channel);
};

export const rawServoToDegrees = (raw: number): number => {
    const minTicks = 500;
    const maxTicks = 2500;
    if (raw <= minTicks) return 0;
    if (raw >= maxTicks) return 180;
    return ((raw - minTicks) * 180) / (maxTicks - minTicks);
};

// --- TEMPERATURE ---

/**
 * Converts signed 14-bit integer to Celsius.
 * Factor: 1 LSB = 0.015625 °C
 */
export const rawTempToCelsius = (rawSigned: number): number => {
    return rawSigned * 0.015625;
};
