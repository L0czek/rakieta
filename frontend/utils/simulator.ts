
import { SystemState, ServoState } from '../types';
import * as PacketBuilder from './packetBuilder';

export interface PacketEmit {
    topic: string;
    payload: Uint8Array | string;
}

export class RocketSimulator {
    private time: number = 0;
    private intervalId: NodeJS.Timeout | null = null;
    private onPacket: (packet: PacketEmit) => void;
    
    // Physics State
    private systemState: SystemState = SystemState.ARMED;
    private servoState: ServoState = ServoState.CLOSED;
    private servoPos: number = 0;
    private isUnsafe: boolean = false;
    
    constructor(onPacket: (packet: PacketEmit) => void) {
        this.onPacket = onPacket;
    }

    public start(startTime: number = 0) {
        this.time = startTime;
        if (this.intervalId) clearInterval(this.intervalId);
        // Send packets every 0.1s (100ms)
        this.intervalId = setInterval(() => this.tick(), 100);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public setTime(t: number) {
        this.time = t;
    }

    public handleCommand(topic: string, payload: string) {
        console.log(`[SIM] Command Rx: ${topic} = ${payload}`);
        
        if (topic === 'cmd/state') {
            const prevState = this.systemState;
            if (payload === 'FIRE') {
                if (this.systemState === SystemState.ARMED && this.isUnsafe) {
                     this.systemState = SystemState.FIRE;
                } else {
                    this.onPacket({ topic: 'status/cmd', payload: 'ERR: Cannot Fire (Check Arm/Safety)' });
                }
            }
            if (payload === 'FIRE_END') this.systemState = SystemState.POSTFIRE;
            if (payload === 'FIRE_RESET') this.systemState = SystemState.ARMED;
            
            if (this.systemState !== prevState) {
                this.onPacket({ topic: 'status/state', payload: this.systemState });
            }
        }
        else if (topic === 'cmd/servo') {
            if (this.systemState !== SystemState.FIRE) {
                 if (payload === 'OPEN') this.servoState = ServoState.OPEN;
                 if (payload === 'CLOSE') this.servoState = ServoState.CLOSED;
                 this.onPacket({ topic: 'status/servo', payload: this.servoState });
            } else {
                this.onPacket({ topic: 'status/cmd', payload: 'ERR: Servo Locked during FIRE' });
            }
        }
    }

    public toggleSafety() {
        this.isUnsafe = !this.isUnsafe;
        this.onPacket({
            topic: 'sensor/digital/armed',
            payload: PacketBuilder.buildDigitalPacket(this.time, this.isUnsafe)
        });
    }

    public getIsUnsafe() { return this.isUnsafe; }

    private tick() {
        const dt = 100; // 100ms tick duration
        const tStart = this.time;
        this.time += dt;
        const tEnd = this.time;

        const isFiring = this.systemState === SystemState.FIRE; 

        // --- PHYSICS & FAST SENSOR GENERATION ---
        // FIRE: 500Hz -> 50 samples per 100ms
        // IDLE: 20Hz -> 2 samples per 100ms
        const sampleRate = isFiring ? 500 : 20;
        const numSamples = Math.round((dt / 1000) * sampleRate);
        const timeStep = dt / numSamples;

        const tankVals = [];
        const combVals = [];
        const thrustVals = [];
        
        // Helper to convert physical back to Raw ADC
        const mapVoltsToRaw = (v: number) => Math.max(0, Math.min(4095, Math.floor(v * (4095/3.3))));
        const toRawP = (bar: number) => mapVoltsToRaw(bar / 40.0);
        const toRawT = (kg: number) => mapVoltsToRaw(kg / 200.0);

        // Servo Movement Integration (Approximate over the step)
        const targetServo = this.servoState === ServoState.OPEN ? 2000 : 0;
        const servoSpeed = 200; // units per tick (faster for 100ms)
        if (this.servoPos < targetServo) this.servoPos = Math.min(targetServo, this.servoPos + servoSpeed);
        if (this.servoPos > targetServo) this.servoPos = Math.max(targetServo, this.servoPos - servoSpeed);

        for (let i = 0; i < numSamples; i++) {
            const tCurrent = tStart + (i * timeStep);
            const phase = tCurrent * 0.005; // Scaling factor for oscillation

            // Tank Pressure: Approx 40 bar with noise and slow breathing
            const tankP = 40 + Math.sin(phase * 0.1) * 0.5 + (Math.random() - 0.5) * 0.2;
            tankVals.push(toRawP(tankP));

            // Combustion Pressure: High noise if firing
            const combP = isFiring ? 35 + Math.random() * 2 : 0.5 + Math.random() * 0.1;
            combVals.push(toRawP(combP));

            // Thrust: High if firing
            const thrust = isFiring ? 150 + Math.random() * 10 : Math.random();
            thrustVals.push(toRawT(thrust));
        }

        // --- PACKET TRANSMISSION ---

        // 1. Send Fast ADC Packets First
        this.onPacket({
            topic: 'sensor/adc/fast/pressure/tank',
            payload: PacketBuilder.buildFastAdcPacket(tStart, tEnd, tankVals)
        });
        this.onPacket({
            topic: 'sensor/adc/fast/pressure/combustion',
            payload: PacketBuilder.buildFastAdcPacket(tStart, tEnd, combVals)
        });
        this.onPacket({
            topic: 'sensor/adc/fast/tensometer',
            payload: PacketBuilder.buildFastAdcPacket(tStart, tEnd, thrustVals)
        });

        // 2. Send Slow Sensors Immediately (Every 100ms)
        // Voltage divider ratio 5.7. Raw = (V / 5.7) -> Volts -> Raw
        const vToRaw = (v: number) => mapVoltsToRaw(v / 5.7);
        const phaseSlow = tEnd * 0.005;

        const batStand = 12.0 + Math.sin(phaseSlow * 0.1) * 0.2; 
        const batComp = 12.1 + Math.random() * 0.1;
        const boost = isFiring ? 11.5 : 12.5;

        this.onPacket({ topic: 'sensor/adc/slow/battery/stand', payload: PacketBuilder.buildSlowAdcPacket(tEnd, vToRaw(batStand)) });
        this.onPacket({ topic: 'sensor/adc/slow/battery/computer', payload: PacketBuilder.buildSlowAdcPacket(tEnd, vToRaw(batComp)) });
        this.onPacket({ topic: 'sensor/adc/slow/boost_voltage', payload: PacketBuilder.buildSlowAdcPacket(tEnd, vToRaw(boost)) });
        this.onPacket({ topic: 'sensor/adc/slow/starter_sense', payload: PacketBuilder.buildSlowAdcPacket(tEnd, 0) }); // 0V

        // Servo Position
        this.onPacket({
            topic: 'sensor/servo',
            payload: PacketBuilder.buildServoPacket(tEnd, this.servoPos)
        });

        // Temperatures
        const t1 = 24 + tEnd / 10000 + (isFiring ? 5 : 0);
        const t2 = 35 + Math.random();
        this.onPacket({ topic: 'sensor/temp/T1', payload: PacketBuilder.buildTempPacket(tEnd, [t1]) });
        this.onPacket({ topic: 'sensor/temp/T2', payload: PacketBuilder.buildTempPacket(tEnd, [t2]) });
        
        // Statuses
        this.onPacket({ topic: 'status/state', payload: this.systemState });
        this.onPacket({ topic: 'status/servo', payload: this.servoState });
    }
}
