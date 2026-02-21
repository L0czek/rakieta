
export enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  ERROR
}

export enum SystemState {
  ARMED = 'ARMED',
  FIRE = 'FIRE',
  POSTFIRE = 'POSTFIRE',
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

export interface SystemTelemetry {
  startTime: number;
  lastPacketTimestamp: number;

  // Fast ADCs (History is built-in)
  tensometer: SensorDataPoint[];
  pressureTank: SensorDataPoint[];
  pressureCombustion: SensorDataPoint[];
  
  // Slow ADCs (Current Value)
  batteryStand: number;
  batteryComputer: number;
  boostVoltage: number;
  starterSense: number;
  
  // Slow ADCs (History for Analysis)
  batteryStandHist: SensorDataPoint[];
  batteryComputerHist: SensorDataPoint[];
  boostVoltageHist: SensorDataPoint[];
  starterSenseHist: SensorDataPoint[];

  // Digital/Virtual
  isUnsafe: boolean; // sensor/digital/armed
  servoPosition: number; // 0-2000
  servoPositionHist: SensorDataPoint[]; // 0-100%
  
  // Temperatures
  temperatures: Record<string, number>; // Current values
  temperatureHist: Record<string, SensorDataPoint[]>; // History
  
  // Statuses
  state: SystemState;
  servoState: ServoState;
  lastCmdStatus: string;
}

export interface MqttConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  simulation?: boolean;
}
