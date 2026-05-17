
export enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  ERROR
}

export const FIRE_COUNTDOWN_DURATION_MS = 10_000;

export enum SystemState {
  ARMED = 'ARMED',
  COUNTDOWN = 'COUNTDOWN',
  FIRE = 'FIRE',
  POSTFIRE = 'POSTFIRE',
  LAMPTEST = 'LAMPTEST',
  CAMERATEST = 'CAMERATEST',
  UNKNOWN = 'UNKNOWN'
}

export enum ServoState {
  CLOSED = 'CLOSED',
  OPENING = 'OPENING',
  OPEN = 'OPEN',
  CLOSING = 'CLOSING',
  UNKNOWN = 'UNKNOWN'
}

export interface SensorDataPoint {
  timestamp: number;
  value: number;
}

export interface StatusLogEntry {
  message: string;
  receivedAt: number;
  type: 'log' | 'warning' | 'connection';
}

export interface SystemTelemetry {
  startTime: number;
  lastPacketTimestamp: number;
  avgFastAdcPacketLength: number;
  countdownStartedAtWall: number | null;
  countdownEndsAtWall: number | null;

  // Fast ADCs
  tensometer: SensorDataPoint[];
  pressureTank: SensorDataPoint[];
  pressureCombustion: SensorDataPoint[];

  // Latest raw ADC samples for pressure channels (for calibration debug view)
  pressureTankRaw: number | null;
  pressureCombustionRaw: number | null;
  
  // Slow ADCs
  batteryStand: SensorDataPoint[];
  batteryComputer: SensorDataPoint[];
  boostVoltage: SensorDataPoint[];
  starterSense: SensorDataPoint[];

  // Digital/Virtual
  isUnsafe: boolean; // sensor/digital/armed
  servoPosition: SensorDataPoint[]; // 0-180°
  
  // Temperatures
  temperatures: Record<string, SensorDataPoint[]>;
  
  // Statuses
  state: SystemState;
  servoState: ServoState;
  cpuIdlePermille: number | null;
  wifiRssiDbm: number | null;
  statusLog: StatusLogEntry[];
}

export interface MqttConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  simulation?: boolean;
}
