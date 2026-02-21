
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
import { probeCount, probeDuration, withProbe } from '@/utils/perfProbe';

const DEFAULT_TELEMETRY: SystemTelemetry = {
  startTime: 0,
  lastPacketTimestamp: 0,
  tensometer: [],
  pressureTank: [],
  pressureCombustion: [],
  batteryStand: 0,
  batteryComputer: 0,
  boostVoltage: 0,
  starterSense: 0,
  batteryStandHist: [],
  batteryComputerHist: [],
  boostVoltageHist: [],
  starterSenseHist: [],
  isUnsafe: false,
  servoPosition: 0,
  servoPositionHist: [],
  temperatures: {},
  temperatureHist: {},
  state: SystemState.UNKNOWN,
  servoState: ServoState.UNKNOWN,
  lastCmdStatus: "Waiting for connection...",
};

// Reduced to 2500 to hold 5 seconds of data at 500Hz
const MAX_LIVE_POINTS = 2500;

const cloneTelemetry = (t: SystemTelemetry): SystemTelemetry => JSON.parse(JSON.stringify(t));

export const useMqttSystem = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [isSimulating, setIsSimulating] = useState(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(cloneTelemetry(DEFAULT_TELEMETRY));
  
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const telemetryRef = useRef<SystemTelemetry>(cloneTelemetry(DEFAULT_TELEMETRY));
  const simulatorRef = useRef<RocketSimulator | null>(null);
  
  // Ref to handleMessage to avoid stale closures in simulator callback
  const handleMessageRef = useRef<(topic: string, message: any) => void>(null);

  // DB Buffer
  const writeBufferRef = useRef<Record<string, SensorDataPoint[]>>({});
  const flushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial state from DB
  useEffect(() => {
    const loadState = async () => {
        try {
            const lastTs = await DB.getLastTimestamp();
            const startTs = await DB.getFirstTimestamp();
            telemetryRef.current.lastPacketTimestamp = lastTs;
            telemetryRef.current.startTime = startTs || lastTs; 
            setTelemetry({ ...telemetryRef.current });
        } catch (e) {
            console.error("Failed to load DB state", e);
        }
    };
    loadState();
  }, []);

  // Flush buffer to DB periodically
  useEffect(() => {
      flushIntervalRef.current = setInterval(async () => {
          const buffer = writeBufferRef.current;
          const sensors = Object.keys(buffer);
          if (sensors.length === 0) return;

          const flushStart = performance.now();
          const toWrite = { ...buffer };
          writeBufferRef.current = {};
          const pointsToFlush = sensors.reduce((sum, key) => sum + (toWrite[key]?.length || 0), 0);

          try {
              const promises = sensors.map(key => DB.addMeasurements(key, toWrite[key]));
              await Promise.all(promises);
              
              const maxTs = Math.max(...sensors.map(k => {
                  const arr = toWrite[k];
                  return arr.length > 0 ? arr[arr.length-1].timestamp : 0;
              }));
              if (maxTs > 0) await DB.setLastTimestamp(maxTs);
              probeCount('db.flush.sensors', sensors.length);
              probeCount('db.flush.points', pointsToFlush);
              probeDuration('db.flush.ms', performance.now() - flushStart);

          } catch (e) {
              console.error("DB Flush Error", e);
          }
      }, 500); 
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
    
    // Clear Write Buffer
    writeBufferRef.current = {};

    // Reset Telemetry
    telemetryRef.current = cloneTelemetry(DEFAULT_TELEMETRY);
    setTelemetry(cloneTelemetry(DEFAULT_TELEMETRY));
    
    // Reset Simulator Time if running
    if (simulatorRef.current) {
        simulatorRef.current.setTime(0);
    }
  }, []);

  const addToBuffer = (key: string, points: SensorDataPoint[]) => {
      if (!writeBufferRef.current[key]) writeBufferRef.current[key] = [];
      writeBufferRef.current[key].push(...points);
  };

  const handleMessage = (topic: string, message: any) => {
    if (connectionStatus === ConnectionState.ERROR) return;
    probeCount('mqtt.message.total');

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

    const updateFastSensor = (key: keyof SystemTelemetry, dbKey: string, tStart: number, tEnd: number, values: number[]) => {
      if (!checkTime(tStart)) return;

      current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, tEnd);
      if (current.startTime === 0) current.startTime = tStart;

      const count = values.length;
      let step = count > 1 ? (tEnd - tStart) / (count - 1) : 0;
      const points = values.map((v, i) => ({ timestamp: tStart + (i * step), value: v }));
      probeCount('mqtt.fast.points', points.length);
      
      addToBuffer(dbKey, points);

      // @ts-ignore
      const currentHistory: SensorDataPoint[] = current[key];
      // @ts-ignore
      current[key] = withProbe(
        'telemetry.fast.concat_slice.ms',
        () => [...currentHistory, ...points].slice(-MAX_LIVE_POINTS)
      );
    };

    const updateSlowSensor = (
        valKey: keyof SystemTelemetry, 
        histKey: keyof SystemTelemetry, 
        dbKey: string,
        timestamp: number, 
        value: number
    ) => {
        if (!checkTime(timestamp)) return;

        current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestamp);
        if (current.startTime === 0) current.startTime = timestamp;

        // @ts-ignore
        current[valKey] = value;
        const pt = { timestamp, value };
        addToBuffer(dbKey, [pt]);

        // @ts-ignore
        const curHist = current[histKey] as SensorDataPoint[];
        // @ts-ignore
        current[histKey] = withProbe(
          'telemetry.slow.concat_slice.ms',
          () => [...curHist, pt].slice(-MAX_LIVE_POINTS)
        );
    };

    if (topic === 'sensor/adc/fast/tensometer') {
      probeCount('mqtt.message.fast.tensometer');
      const { timestampStart, timestampEnd, values } = Parser.parseFastAdc(buffer);
      updateFastSensor('tensometer', 'tensometer', timestampStart, timestampEnd, values.map(v => Converters.rawToThrustKg(v)));
    } 
    else if (topic === 'sensor/adc/fast/pressure/tank') {
      probeCount('mqtt.message.fast.pressure_tank');
      const { timestampStart, timestampEnd, values } = Parser.parseFastAdc(buffer);
      updateFastSensor('pressureTank', 'pressureTank', timestampStart, timestampEnd, values.map(v => Converters.rawToPressureBar(v)));
    }
    else if (topic === 'sensor/adc/fast/pressure/combustion') {
      probeCount('mqtt.message.fast.pressure_combustion');
      const { timestampStart, timestampEnd, values } = Parser.parseFastAdc(buffer);
      updateFastSensor('pressureCombustion', 'pressureCombustion', timestampStart, timestampEnd, values.map(v => Converters.rawToPressureBar(v)));
    }
    else if (topic.startsWith('sensor/adc/slow/')) {
        probeCount('mqtt.message.slow');
        const { timestamp, value: raw } = Parser.parseSlowAdc(buffer);
        if (topic.includes('battery/stand')) updateSlowSensor('batteryStand', 'batteryStandHist', 'batteryStand', timestamp, Converters.rawToBatteryVoltage(raw));
        if (topic.includes('battery/computer')) updateSlowSensor('batteryComputer', 'batteryComputerHist', 'batteryComputer', timestamp, Converters.rawToBatteryVoltage(raw));
        if (topic.includes('boost_voltage')) updateSlowSensor('boostVoltage', 'boostVoltageHist', 'boostVoltage', timestamp, Converters.rawToBatteryVoltage(raw));
        if (topic.includes('starter_sense')) updateSlowSensor('starterSense', 'starterSenseHist', 'starterSense', timestamp, Converters.rawToGenericVoltage(raw));
    }
    else if (topic === 'sensor/digital/armed') {
        probeCount('mqtt.message.digital.armed');
        const { timestamp, value } = Parser.parseDigital(buffer);
        checkTime(timestamp);
        current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestamp);
        current.isUnsafe = value !== 0; 
    }
    else if (topic.startsWith('sensor/temp/')) {
        probeCount('mqtt.message.temp');
        const { timestamp, values } = Parser.parseTemp(buffer);
        checkTime(timestamp);
        current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestamp);
        const sensorId = topic.split('/').pop() || 'unknown';
        if (values.length > 0) {
            const tempVal = Converters.rawTempToCelsius(values[values.length - 1]);
            current.temperatures = { ...current.temperatures, [sensorId]: tempVal };
            
            const pt = { timestamp, value: tempVal };
            addToBuffer(sensorId, [pt]);

            const oldHist = current.temperatureHist[sensorId] || [];
            current.temperatureHist = {
                ...current.temperatureHist,
                [sensorId]: withProbe(
                  'telemetry.temp.concat_slice.ms',
                  () => [...oldHist, pt].slice(-MAX_LIVE_POINTS)
                )
            };
        }
    }
    else if (topic === 'sensor/servo') {
        probeCount('mqtt.message.servo');
        const { timestamp, value } = Parser.parseServo(buffer);
        checkTime(timestamp);
        current.lastPacketTimestamp = Math.max(current.lastPacketTimestamp, timestamp);
        current.servoPosition = value;
        
        const percent = Converters.rawServoToPercent(value);
        const pt = { timestamp, value: percent };
        addToBuffer('servo', [pt]);
        current.servoPositionHist = withProbe(
          'telemetry.servo.concat_slice.ms',
          () => [...current.servoPositionHist, pt].slice(-MAX_LIVE_POINTS)
        );
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
        current.lastCmdStatus = message.toString();
    }
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
        const topics = [
            'sensor/adc/fast/#',
            'sensor/adc/slow/#',
            'sensor/digital/armed',
            'sensor/temp/#',
            'sensor/servo',
            'cmd/state', 'cmd/servo', 'status/#'
        ];
        client.subscribe(topics);
    });

    client.on('error', (err) => {
        console.error('MQTT Error:', err);
        // Connection error does not kill the app or the sim
    });

    client.on('close', () => {
        setConnectionStatus(ConnectionState.DISCONNECTED);
    });

    client.on('message', (topic, message) => {
        try {
            handleMessage(topic, message);
        } catch (e) {
            console.error("Error handling message", e);
        }
    });

    clientRef.current = client;
  }, []);

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
          const publishStart = performance.now();
          setTelemetry({ ...telemetryRef.current });
          probeCount('react.telemetry_publish.count');
          probeDuration('react.telemetry_publish.call_ms', performance.now() - publishStart);
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

  const setFireState = (cmd: 'FIRE' | 'FIRE_END' | 'FIRE_RESET') => sendCommand('cmd/state', cmd);
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
    connect,
    disconnect,
    toggleSimulation,
    resetData,
    actions: { setFireState, setServoCmd, toggleSimSafety }
  };
};
