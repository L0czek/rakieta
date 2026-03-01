
import { useEffect, useState, useRef, useCallback } from 'react';
import mqtt from 'mqtt';
import { 
  SystemTelemetry, 
  SystemState, 
  ServoState, 
  ConnectionState, 
  MqttConfig,
  SensorDataPoint
} from '../types';
import * as Parser from '../utils/parser';
import * as Converters from '../utils/conversions';
import * as DB from '../utils/db';
import { RocketSimulator, PacketEmit } from '../utils/simulator';
import {
  ChecklistContextValue,
  ChecklistPointRuntimeState,
  ChecklistTopicUpdate,
} from '@/types/checklist';
import { buildChecklistPointTopic, parseChecklistPointTopic } from '@/utils/checklistTopics';

const DEFAULT_TELEMETRY: SystemTelemetry = {
  startTime: 0,
  lastPacketTimestamp: 0,
  avgFastAdcPacketLength: 0,
  tensometer: [],
  pressureTank: [],
  pressureCombustion: [],
  batteryStand: [],
  batteryComputer: [],
  boostVoltage: [],
  starterSense: [],
  isUnsafe: false,
  servoPosition: [],
  temperatures: {},
  state: SystemState.UNKNOWN,
  servoState: ServoState.UNKNOWN,
  lastCmdStatus: "Waiting for connection...",
  statusLog: [
    {
      message: 'Waiting for connection...',
      receivedAt: Date.now(),
      type: 'connection',
    },
  ],
};

const MAX_FAST_LIVE_POINTS = 5000;
const FAST_PACKET_AVERAGE_WINDOW = 50;
const MAX_OTHER_LIVE_POINTS = 50;
const MAX_TEMPERATURE_LIVE_POINTS = 100;
const MAX_SERVO_LIVE_POINTS = 500;
const FLUSH_INTERVAL_MS = 500;
const roundTimestamp = (timestamp: number): number => Math.round(timestamp);
const STALE_CHUNK_FLUSH_MS = 500;

const cloneTelemetry = (t: SystemTelemetry): SystemTelemetry => JSON.parse(JSON.stringify(t));

interface ActiveChunkBuffer {
  chunkStart: number;
  chunkEnd: number;
  timestamps: number[];
  values: number[];
  lastUpdateAt: number;
}

const buildChecklistPointStateKey = (checklistId: string, pointId: string): string =>
  `${checklistId}/${pointId}`;

const toMessageText = (message: any): string => {
  if (typeof message === 'string') return message;
  if (message instanceof Uint8Array) return new TextDecoder().decode(message);
  return String(message);
};

const isChecklistContextValue = (value: unknown): value is ChecklistContextValue => {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
};

export const parseChecklistPointStatePayload = (
  payload: string,
): ChecklistPointRuntimeState | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;

  if (typeof record.completed !== 'boolean') return null;
  if (record.completedAtWall !== null && typeof record.completedAtWall !== 'number') return null;
  if (record.completedAtTelemetry !== null && typeof record.completedAtTelemetry !== 'number') {
    return null;
  }
  if (!record.context || typeof record.context !== 'object' || Array.isArray(record.context)) {
    return null;
  }

  const context: Record<string, ChecklistContextValue> = {};
  for (const [key, value] of Object.entries(record.context as Record<string, unknown>)) {
    if (!isChecklistContextValue(value)) return null;
    context[key] = value;
  }

  return {
    completed: record.completed,
    completedAtWall: record.completedAtWall as number | null,
    completedAtTelemetry: record.completedAtTelemetry as number | null,
    context,
  };
};

type FastHistoryKey = 'tensometer' | 'pressureTank' | 'pressureCombustion';
type SlowHistoryKey = 'batteryStand' | 'batteryComputer' | 'boostVoltage' | 'starterSense';

export const useMqttSystem = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [isSimulating, setIsSimulating] = useState(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(cloneTelemetry(DEFAULT_TELEMETRY));
  const [checklistPointStates, setChecklistPointStates] = useState<
    Record<string, ChecklistPointRuntimeState>
  >({});
  
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const telemetryRef = useRef<SystemTelemetry>(cloneTelemetry(DEFAULT_TELEMETRY));
  const telemetryVersionRef = useRef(0);
  const publishedTelemetryVersionRef = useRef(-1);
  const simulatorRef = useRef<RocketSimulator | null>(null);
  const checklistPointStatesRef = useRef<Record<string, ChecklistPointRuntimeState>>({});
  const fastPacketDurationWindowRef = useRef<number[]>([]);
  const fastPacketDurationWindowSumRef = useRef(0);
  
  // Ref to handleMessage to avoid stale closures in simulator callback
  const handleMessageRef = useRef<(topic: string, message: any) => void>(null);

  // DB Buffer
  const activeChunksRef = useRef<Record<string, ActiveChunkBuffer>>({});
  const sealedChunksRef = useRef<DB.MeasurementChunk[]>([]);
  const flushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial state from DB
  useEffect(() => {
    const loadState = async () => {
        try {
                        const [lastTsMeta, measurementRange] = await Promise.all([
                            DB.getLastTimestamp(),
                            DB.getMeasurementTimeRange(),
                        ]);
                        const lastTs = Math.max(lastTsMeta, measurementRange.end);
                        telemetryRef.current.lastPacketTimestamp = lastTs;
                        telemetryRef.current.startTime = measurementRange.start;
            setTelemetry({ ...telemetryRef.current });
        } catch (e) {
            console.error("Failed to load DB state", e);
        }
    };
    loadState();
  }, []);

  const sealActiveChunk = (sensorId: string, chunk: ActiveChunkBuffer) => {
      if (chunk.timestamps.length === 0) return;
      sealedChunksRef.current.push({
          sensorId,
          chunkStart: chunk.chunkStart,
          chunkEnd: chunk.chunkEnd,
          timestamps: Uint32Array.from(chunk.timestamps),
          values: Float32Array.from(chunk.values),
      });
  };

  const appendPointToChunk = (sensorId: string, point: SensorDataPoint) => {
      const now = performance.now();
      const current = activeChunksRef.current[sensorId];
      if (!current) {
          activeChunksRef.current[sensorId] = {
              chunkStart: point.timestamp,
              chunkEnd: point.timestamp,
              timestamps: [0],
              values: [point.value],
              lastUpdateAt: now,
          };
          return;
      }

      if (point.timestamp < current.chunkStart) {
          sealActiveChunk(sensorId, current);
          activeChunksRef.current[sensorId] = {
              chunkStart: point.timestamp,
              chunkEnd: point.timestamp,
              timestamps: [0],
              values: [point.value],
              lastUpdateAt: now,
          };
          return;
      }

      current.timestamps.push(Math.max(0, Math.round(point.timestamp - current.chunkStart)));
      current.values.push(point.value);
      current.chunkEnd = point.timestamp;
      current.lastUpdateAt = now;

      if (point.timestamp - current.chunkStart >= DB.MAX_CHUNK_DURATION_MS) {
          sealActiveChunk(sensorId, current);
          delete activeChunksRef.current[sensorId];
      }
  };

  const appendPointsToChunk = (sensorId: string, points: SensorDataPoint[]) => {
      for (const point of points) appendPointToChunk(sensorId, point);
  };

  // Flush buffer to DB periodically
  useEffect(() => {
      flushIntervalRef.current = setInterval(async () => {
          const now = performance.now();

          for (const [sensorId, chunk] of Object.entries(activeChunksRef.current) as [
            string,
            ActiveChunkBuffer,
          ][]) {
              if (now - chunk.lastUpdateAt > STALE_CHUNK_FLUSH_MS) {
                  sealActiveChunk(sensorId, chunk);
                  delete activeChunksRef.current[sensorId];
              }
          }

          const chunks = sealedChunksRef.current;
          if (chunks.length === 0) return;

          sealedChunksRef.current = [];

          try {
              await DB.addChunks(chunks);
              
              const maxTs = Math.max(...chunks.map(chunk => chunk.chunkEnd));
              if (maxTs > 0) await DB.setLastTimestamp(maxTs);

          } catch (e) {
              console.error("DB Flush Error", e);
          }
      }, FLUSH_INTERVAL_MS); 
      return () => clearInterval(flushIntervalRef.current!);
  }, []);

  const forceDisconnect = useCallback((reason: string) => {
      console.error(`CRITICAL SYSTEM ERROR: ${reason}`);
      setCriticalError(reason);
      setConnectionStatus(ConnectionState.ERROR);
      
      if (clientRef.current) {
          clientRef.current.end(true); 
          clientRef.current = null;
      }
      if (simulatorRef.current) {
          simulatorRef.current.stop();
          simulatorRef.current = null;
      }
      setIsSimulating(false);
  }, []);

  const disconnect = useCallback(() => {
      if (clientRef.current) {
          clientRef.current.end();
          clientRef.current = null;
      }
      // Do not stop simulator here, it is independent
      setConnectionStatus(ConnectionState.DISCONNECTED);
  }, []);

  const resetData = useCallback(async () => {
    await DB.clearDB();
    setCriticalError(null);
        setConnectionStatus((prev) => prev === ConnectionState.ERROR ? ConnectionState.DISCONNECTED : prev);
    
    activeChunksRef.current = {};
    sealedChunksRef.current = [];

    // Reset Telemetry
    telemetryRef.current = cloneTelemetry(DEFAULT_TELEMETRY);
    fastPacketDurationWindowRef.current = [];
    fastPacketDurationWindowSumRef.current = 0;
    telemetryVersionRef.current += 1;
    setTelemetry(cloneTelemetry(DEFAULT_TELEMETRY));
    
    // Reset Simulator Time if running
    if (simulatorRef.current) {
        simulatorRef.current.setTime(0);
    }
  }, []);

  const applyChecklistTopicUpdate = useCallback((update: ChecklistTopicUpdate) => {
    const key = buildChecklistPointStateKey(update.checklistId, update.pointId);
    checklistPointStatesRef.current = {
      ...checklistPointStatesRef.current,
      [key]: update.state,
    };
    setChecklistPointStates(checklistPointStatesRef.current);
  }, []);

  const appendStatusLogEntry = useCallback((message: string, type: 'status' | 'connection') => {
    const current = telemetryRef.current;
    current.statusLog = [...current.statusLog, { message, receivedAt: Date.now(), type }];
  }, []);

  const handleMessage = (topic: string, message: any, isRetained = false) => {
    if (connectionStatus === ConnectionState.ERROR) return;

    const checklistTopicParts = parseChecklistPointTopic(topic);
    if (checklistTopicParts) {
      const parsedState = parseChecklistPointStatePayload(toMessageText(message));
      if (!parsedState) {
        console.warn(`Invalid checklist state payload on topic: ${topic}`);
        return;
      }

      applyChecklistTopicUpdate({
        checklistId: checklistTopicParts.checklistId,
        pointId: checklistTopicParts.pointId,
        state: parsedState,
      });
      return;
    }

    // Convert message to Uint8Array if it's a string/buffer
    let buffer: Uint8Array;
    if (typeof message === 'string') {
        buffer = new TextEncoder().encode(message);
    } else if (message instanceof Uint8Array) {
        buffer = message;
    } else {
        buffer = new Uint8Array(message);
    }

    const current = telemetryRef.current;

    const checkTime = (ts: number) => {
        if (current.lastPacketTimestamp > 0 && ts < current.lastPacketTimestamp) {
             if (current.lastPacketTimestamp - ts > 1000) {
                 forceDisconnect(`TIME TRAVEL DETECTED. Received: ${ts}, System Last: ${current.lastPacketTimestamp}.`);
                 return false;
             }
        }
        return true;
    };

    const updateFastSensor = (key: FastHistoryKey, dbKey: string, tStart: number, tEnd: number, values: number[]) => {
      if (!checkTime(tStart)) return;

      const packetDuration = Math.max(0, tEnd - tStart);
      fastPacketDurationWindowRef.current.push(packetDuration);
      fastPacketDurationWindowSumRef.current += packetDuration;
      if (fastPacketDurationWindowRef.current.length > FAST_PACKET_AVERAGE_WINDOW) {
        const removed = fastPacketDurationWindowRef.current.shift() ?? 0;
        fastPacketDurationWindowSumRef.current -= removed;
      }
      current.avgFastAdcPacketLength =
        fastPacketDurationWindowRef.current.length > 0
          ? fastPacketDurationWindowSumRef.current / fastPacketDurationWindowRef.current.length
          : 0;

      current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, tEnd);
      if (current.startTime === 0) current.startTime = tStart;

      const count = values.length;
      const step = count > 1 ? (tEnd - tStart) / (count - 1) : 0;
      const points = values.map((v, i) => ({
        timestamp: roundTimestamp(tStart + (i * step)),
        value: v,
      }));
      
      appendPointsToChunk(dbKey, points);

      const currentHistory = current[key];
      current[key] = [...currentHistory, ...points].slice(-MAX_FAST_LIVE_POINTS);
    };

    const updateSlowSensor = (
        key: SlowHistoryKey,
        dbKey: string,
        timestamp: number, 
        value: number
    ) => {
        if (!checkTime(timestamp)) return;

        current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestamp);
        if (current.startTime === 0) current.startTime = timestamp;

        const pt = { timestamp, value };
        appendPointToChunk(dbKey, pt);

        const curHist = current[key];
        current[key] = [...curHist, pt].slice(-MAX_OTHER_LIVE_POINTS);
    };

    if (topic === 'sensor/adc/fast/tensometer') {
      const { timestampStart, timestampEnd, values } = Parser.parseFastAdc(buffer);
      updateFastSensor('tensometer', 'tensometer', timestampStart, timestampEnd, values.map(v => Converters.rawToThrustKg(v)));
    } 
    else if (topic === 'sensor/adc/fast/pressure/tank') {
      const { timestampStart, timestampEnd, values } = Parser.parseFastAdc(buffer);
            updateFastSensor('pressureTank', 'pressureTank', timestampStart, timestampEnd, values.map(v => Converters.rawToPressureBar(v, 'pressureTank')));
    }
    else if (topic === 'sensor/adc/fast/pressure/combustion') {
      const { timestampStart, timestampEnd, values } = Parser.parseFastAdc(buffer);
            updateFastSensor('pressureCombustion', 'pressureCombustion', timestampStart, timestampEnd, values.map(v => Converters.rawToPressureBar(v, 'pressureCombustion')));
    }
    else if (topic.startsWith('sensor/adc/slow/')) {
        const { timestamp, value: raw } = Parser.parseSlowAdc(buffer);
          if (topic.includes('battery/stand')) updateSlowSensor('batteryStand', 'batteryStand', timestamp, Converters.rawToVoltage(raw, 'batteryStand'));
          if (topic.includes('battery/computer')) updateSlowSensor('batteryComputer', 'batteryComputer', timestamp, Converters.rawToVoltage(raw, 'batteryComputer'));
          if (topic.includes('boost_voltage')) updateSlowSensor('boostVoltage', 'boostVoltage', timestamp, Converters.rawToVoltage(raw, 'boostVoltage'));
          if (topic.includes('starter_sense')) updateSlowSensor('starterSense', 'starterSense', timestamp, Converters.rawToVoltage(raw, 'starterSense'));
    }
    else if (topic === 'sensor/digital/armed') {
        const { timestamp, value } = Parser.parseDigital(buffer);
        if (!isRetained) {
          checkTime(timestamp);
          current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestamp);
        }
        current.isUnsafe = value !== 0; 
    }
    else if (topic.startsWith('sensor/temp/')) {
        const { timestampStart, timestampEnd, values } = Parser.parseTemp(buffer);
        if (!checkTime(timestampStart)) return;
        current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestampEnd);
        if (current.startTime === 0) current.startTime = timestampStart;
        const sensorId = topic.split('/').pop() || 'unknown';
        if (values.length > 0) {
        const tempValues = values.map(v => Converters.rawTempToCelsius(v));
        const count = tempValues.length;
        const step = count > 1 ? (timestampEnd - timestampStart) / (count - 1) : 0;
        const points = tempValues.map((value, i) => ({
          timestamp: timestampStart + (i * step),
          value,
        }));

        appendPointsToChunk(sensorId, points);

        const oldHist = current.temperatures[sensorId] || [];
            current.temperatures = {
                ...current.temperatures,
                [sensorId]: [...oldHist, ...points].slice(-MAX_TEMPERATURE_LIVE_POINTS)
            };
        }
    }
    else if (topic === 'sensor/servo') {
        const { timestamp, value } = Parser.parseServo(buffer);
        if (!isRetained) {
          checkTime(timestamp);
          current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestamp);
        }
        
        const degrees = Converters.rawServoToDegrees(value);
        const pt = { timestamp, value: degrees };
        if (!isRetained) {
          appendPointToChunk('servo', pt);
        }
        current.servoPosition = [...current.servoPosition, pt].slice(-MAX_SERVO_LIVE_POINTS);
    }
    else if (topic === 'status/state') {
        const val = message.toString();
        if (val === 'ARMED') current.state = SystemState.ARMED;
        else if (val === 'POSTFIRE') current.state = SystemState.POSTFIRE;
        else if (val === 'FIRE') current.state = SystemState.FIRE;
        else current.state = SystemState.UNKNOWN;
    }
    else if (topic === 'status/servo') {
        const val = message.toString();
        if (val === 'CLOSED') current.servoState = ServoState.CLOSED;
        else if (val === 'OPENING') current.servoState = ServoState.OPENING;
        else if (val === 'OPEN') current.servoState = ServoState.OPEN;
        else if (val === 'CLOSING') current.servoState = ServoState.CLOSING;
        else current.servoState = ServoState.UNKNOWN;
    }
    else if (topic === 'status/cmd') {
        const statusMessage = message.toString();
        current.lastCmdStatus = statusMessage;
        appendStatusLogEntry(statusMessage, 'status');
    }

    telemetryVersionRef.current += 1;
  };

  // Keep ref up to date
  handleMessageRef.current = handleMessage;

  const connect = useCallback((config: MqttConfig) => {
    setCriticalError(null);
    if (clientRef.current) { clientRef.current.end(); clientRef.current = null; }
    
    // NOTE: We do NOT touch simulatorRef here. It is independent.

    setConnectionStatus(ConnectionState.CONNECTING);
    const connectionUrl = `ws://${config.host}:${config.port}`;
    console.log(`Connecting to ${connectionUrl}`);

    const client = mqtt.connect(connectionUrl, {
        username: config.username,
        password: config.password,
        clientId: `scada_web_${Math.random().toString(16).substr(2, 8)}`,
        protocol: 'ws',
        clean: true,
        keepalive: 30,
    });

    client.on('connect', () => {
        setConnectionStatus(ConnectionState.CONNECTED);
      appendStatusLogEntry(`Connected to ${connectionUrl}`, 'connection');
      telemetryVersionRef.current += 1;
        const topics = [
            'sensor/adc/fast/#',
            'sensor/adc/slow/#',
            'sensor/digital/armed',
            'sensor/temp/#',
            'sensor/servo',
            'cmd/state', 'cmd/servo', 'status/#',
            'checklist/+/points/+/state'
        ];
        client.subscribe(topics);
    });

    client.on('error', (err) => {
        console.error('MQTT Error:', err);
        // Connection error does not kill the app or the sim
    });

    client.on('close', () => {
        setConnectionStatus(ConnectionState.DISCONNECTED);
      appendStatusLogEntry('Disconnected from broker', 'connection');
      telemetryVersionRef.current += 1;
    });

    client.on('message', (topic, message, packet) => {
        try {
        handleMessage(topic, message, packet.retain === true);
        } catch (e) {
            console.error("Error handling message", e);
        }
    });

    clientRef.current = client;
  }, [appendStatusLogEntry]);

  const toggleSimulation = useCallback((enabled: boolean) => {
      if (enabled) {
          if (!simulatorRef.current) {
              console.log('Starting Simulation Mode');
              setIsSimulating(true);
              
              simulatorRef.current = new RocketSimulator((packet: PacketEmit) => {
                  // If we are connected to MQTT, publish it!
                  if (clientRef.current && clientRef.current.connected) {
                      // Cast payload to any because mqtt types require Buffer | string, but in browser Uint8Array works
                      clientRef.current.publish(packet.topic, packet.payload as any, { qos: 0 });
                  } else {
                      // Otherwise, loopback locally via Ref to avoid stale closures
                      handleMessageRef.current?.(packet.topic, packet.payload);
                  }
              });

              // Start sim time at 0 per requirement
              simulatorRef.current.start(0);
          }
      } else {
          if (simulatorRef.current) {
              console.log('Stopping Simulation Mode');
              simulatorRef.current.stop();
              simulatorRef.current = null;
          }
          setIsSimulating(false);
      }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      // Only update state if not in critical error
      if (connectionStatus !== ConnectionState.ERROR) {
          if (publishedTelemetryVersionRef.current === telemetryVersionRef.current) {
              return;
          }

          publishedTelemetryVersionRef.current = telemetryVersionRef.current;
          setTelemetry({ ...telemetryRef.current });
      }
    }, 33);
    return () => clearInterval(interval);
  }, [connectionStatus]);

  const sendCommand = (topic: string, payload: string) => {
    // 1. If connected to MQTT, send it there.
    if (clientRef.current && clientRef.current.connected) {
      clientRef.current.publish(topic, payload, { qos: 1, retain: false });
    } 
    
    // 2. If simulating, tell the simulator.
    if (simulatorRef.current) {
        simulatorRef.current.handleCommand(topic, payload);
    }
  };

  const publishChecklistPointState = useCallback(
    async (checklistId: string, pointId: string, state: ChecklistPointRuntimeState): Promise<void> => {
      applyChecklistTopicUpdate({ checklistId, pointId, state });

      const client = clientRef.current;
      if (!client || !client.connected) {
        return;
      }

      const topic = buildChecklistPointTopic(checklistId, pointId);
      const payload = JSON.stringify(state);
      await new Promise<void>((resolve, reject) => {
        client.publish(topic, payload, { qos: 1, retain: true }, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    [applyChecklistTopicUpdate],
  );

  const setFireState = (cmd: 'FIRE' | 'FIRE_END' | 'FIRE_RESET') => sendCommand('cmd/state', cmd);
  const requestShutdown = () => sendCommand('cmd/shutdown', 'SHUTDOWN');
  const setServoCmd = (cmd: 'OPEN' | 'CLOSE') => {
    if (telemetry.state === SystemState.FIRE) return;
    sendCommand('cmd/servo', cmd);
  };
  
  const toggleSimSafety = () => {
      if (simulatorRef.current) {
          simulatorRef.current.toggleSafety();
      }
  };

  return {
    connectionStatus,
    isSimulating,
    criticalError,
    telemetry,
    checklistPointStates,
    connect,
    disconnect,
    toggleSimulation,
    publishChecklistPointState,
    resetData,
    actions: { setFireState, setServoCmd, toggleSimSafety, requestShutdown }
  };
};
