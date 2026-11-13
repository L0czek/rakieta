import {
  ChecklistContextField,
  ChecklistDefinition,
  ChecklistPointDefinition,
  ChecklistRule,
} from '@/types/checklist';
import { ServoState, SystemState } from '@/types';

// The hot fire procedure. The content, and the reason for every step and its place, is
// documented in docs/checklists.md; keep the two in step.

/** Thermometers that must be present. Not final yet; set to the exact count once it is. */
export const REQUIRED_THERMOMETER_COUNT = 1;

const manual = (
  id: string,
  callout: string,
  response: string,
  contextFields?: ChecklistContextField[],
): ChecklistPointDefinition => ({ id, callout, response, rule: { type: 'manual' }, contextFields });

const auto = (
  id: string,
  callout: string,
  response: string,
  rule: ChecklistRule,
): ChecklistPointDefinition => ({ id, callout, response, rule });

const SWITCH_SAFE: ChecklistRule = { type: 'boolean_equals', source: 'isUnsafe', equals: false };
const SWITCH_ARMED: ChecklistRule = { type: 'boolean_equals', source: 'isUnsafe', equals: true };
const SERVO_CLOSED: ChecklistRule = { type: 'enum_equals', source: 'servoState', equals: ServoState.CLOSED };
const SERVO_OPEN: ChecklistRule = { type: 'enum_equals', source: 'servoState', equals: ServoState.OPEN };
const STATE_ARMED: ChecklistRule = { type: 'enum_equals', source: 'state', equals: SystemState.ARMED };
const STATE_POSTFIRE: ChecklistRule = { type: 'enum_equals', source: 'state', equals: SystemState.POSTFIRE };

// Sanity range: catches a dead or disconnected sensor and tolerates a zero offset.
const pressureNearZero = (source: 'pressureTank' | 'pressureCombustion'): ChecklistRule => ({
  type: 'number_range',
  source,
  min: -3,
  max: 3,
  unit: 'bar',
  decimals: 1,
});

// From memory, not measured yet (docs/checklists.md, open points).
const STARTER_SENSE_IGNITER: ChecklistRule = {
  type: 'number_range',
  source: 'starterSense',
  min: 2.5,
  max: 3.6,
  unit: 'V',
  decimals: 2,
};
const STARTER_SENSE_LOW: ChecklistRule = {
  type: 'number_range',
  source: 'starterSense',
  min: -0.5,
  max: 0.5,
  unit: 'V',
  decimals: 2,
};

const THERMOMETERS: ChecklistRule = {
  type: 'thermometers',
  minCount: REQUIRED_THERMOMETER_COUNT,
  min: -10,
  max: 40,
};

export const CHECKLIST_DEFINITIONS: ChecklistDefinition[] = [
  {
    id: 'ground_station',
    label: '1. GROUND STATION',
    points: [
      manual('docker_stack', 'Docker stack', 'RUNNING'),
      manual('laptop_power', 'Laptop external power', 'PRESENT'),
      manual('router_antenna', 'Router and antenna', 'POWERED'),
    ],
  },
  {
    id: 'assembly',
    label: '2. ASSEMBLY',
    points: [
      manual('stand_frame', 'Stand frame', 'STABLE AND VERTICAL'),
      manual('flame_deflector', 'Flame deflector', 'IN PLACE'),
      manual('safety_switch_manual', 'Safety switch', 'SAFE'),
      manual('stand_cable', 'Stand cable', 'CONNECTED BOTH ENDS'),
      manual('thermometer_chain', 'Thermometer chain', 'CONNECTED'),
      manual('antenna', 'Antenna', 'AIMED AT STAND'),
      manual('blackbox_card', 'Blackbox card', 'INSERTED'),
      manual('controller_wakeup', 'Controller wake-up', 'DONE'),
      manual('controller_led', 'Controller red LED', 'ON'),
      manual('packet_clock', 'Packet clock', 'COUNTING'),
      auto('safety_switch_safe', 'Safety switch', 'SAFE', SWITCH_SAFE),
      manual('stand_battery', 'Stand battery', 'CONNECTED'),
      auto('wifi_rssi', 'WiFi RSSI', 'ABOVE −75 dBm', { type: 'wifi_rssi_above', min: -75 }),
      manual('status_log', 'Status log', 'READABLE'),
      manual('blackbox_activity_led', 'Blackbox activity LED', 'BLINKING'),
      manual('blackbox_status_led', 'Blackbox status LED', 'OFF'),
      manual('recording_file', 'Recording file', 'GROWING'),
      manual('phone_shutter', 'Phone and shutter cable', 'CONNECTED'),
    ],
  },
  {
    id: 'stand_setup',
    label: '3. STAND SETUP',
    points: [
      manual('calibration', 'Calibration', 'MATCHES EXPORT'),
      auto('stand_battery', 'Stand battery', '11.5–13.5 V', {
        type: 'number_range',
        source: 'batteryStand',
        min: 11.5,
        max: 13.5,
        unit: 'V',
        decimals: 1,
      }),
      auto('boost_voltage', 'Boost voltage', '11–13.5 V', {
        type: 'number_range',
        source: 'boostVoltage',
        min: 11,
        max: 13.5,
        unit: 'V',
        decimals: 1,
      }),
      auto('tank_pressure', 'Tank pressure', '−3 to 3 bar', pressureNearZero('pressureTank')),
      auto('combustion_pressure', 'Combustion pressure', '−3 to 3 bar', pressureNearZero('pressureCombustion')),
      auto('thermometers', 'Thermometers', '−10 to 40 °C', THERMOMETERS),
      manual('tensometer', 'Tensometer', 'STEADY', [
        { id: 'tensometerReading', label: 'Tensometer reading', type: 'number' },
      ]),
      manual('igniter', 'Igniter', 'NOT CONNECTED'),
      auto('servo_closed_before_arming', 'Servo', 'CLOSED', SERVO_CLOSED),
      auto('safety_switch_armed', 'Safety switch', 'ARMED', SWITCH_ARMED),
      manual('signal_light', 'Signal light', 'GREEN'),
      manual('lamp_test', 'Lamp test', 'PASSED'),
      auto('starter_sense', 'Starter sense', 'BELOW 0.5 V', STARTER_SENSE_LOW),
      auto('servo_open', 'Servo', 'OPEN', SERVO_OPEN),
      manual('valve_open_by_eye', 'Valve, by eye', 'OPEN'),
      auto('servo_closed', 'Servo', 'CLOSED', SERVO_CLOSED),
      manual('valve_closed_by_eye', 'Valve, by eye', 'CLOSED'),
      auto('safety_switch_safe', 'Safety switch', 'SAFE', SWITCH_SAFE),
      manual('reference_weight', 'Reference weight', 'RECORDED', [
        { id: 'referenceWeightReading', label: 'Tensometer reading', type: 'number' },
      ]),
      manual('camera_test', 'Camera test', 'CLIP RECORDED'),
    ],
  },
  {
    id: 'engine_setup',
    label: '4. ENGINE SETUP',
    points: [
      auto('safety_switch_safe', 'Safety switch', 'SAFE', SWITCH_SAFE),
      auto('servo_closed', 'Servo', 'CLOSED', SERVO_CLOSED),
      manual('engine', 'Engine', 'MOUNTED'),
      auto('thermometers', 'Thermometers', '−10 to 40 °C', THERMOMETERS),
      manual('igniter', 'Igniter', 'CONNECTED'),
      auto('safety_switch_armed', 'Safety switch', 'ARMED', SWITCH_ARMED),
      auto('starter_sense', 'Starter sense', '2.5–3.6 V', STARTER_SENSE_IGNITER),
      auto('safety_switch_safe_again', 'Safety switch', 'SAFE', SWITCH_SAFE),
    ],
  },
  {
    id: 'fire',
    label: '5. FIRE',
    points: [
      manual('experiment_name', 'Experiment name', 'RECORDED', [
        { id: 'experimentName', label: 'Experiment name', type: 'text', placeholder: 'EXP-001' },
      ]),
      manual('controller_time', 'Controller time', 'RECORDED', [
        { id: 'controllerTime', label: 'Controller time', type: 'text', placeholder: 'T+…' },
      ]),
      manual('recording_file', 'Recording file', 'NEW'),
      manual('frontend_history', 'Frontend history', 'CLEARED'),
      auto('controller_state', 'Controller state', 'ARMED', STATE_ARMED),
      auto('safety_switch_safe', 'Safety switch', 'SAFE', SWITCH_SAFE),
      auto('servo_closed', 'Servo', 'CLOSED', SERVO_CLOSED),
      manual('bottle_filled', 'N2O bottle', 'FILLED', [
        { id: 'bottleFinalWeight', label: 'Final weight', type: 'number' },
      ]),
      manual('bottle_connected', 'N2O bottle', 'CONNECTED'),
      manual('bottle_valve', 'Bottle valve', 'OPEN'),
      auto('tank_pressure_closed', 'Tank pressure', '−3 to 3 bar', pressureNearZero('pressureTank')),
      manual('camera_app', 'Camera app', 'READY'),
      manual('personnel', 'Personnel', 'CLEAR'),
      auto('safety_switch_armed', 'Safety switch', 'ARMED', SWITCH_ARMED),
      auto('starter_sense', 'Starter sense', '2.5–3.6 V', STARTER_SENSE_IGNITER),
      auto('servo_open', 'Servo', 'OPEN', SERVO_OPEN),
      auto('tank_pressure_open', 'Tank pressure', '30–70 bar', {
        type: 'number_range',
        source: 'pressureTank',
        min: 30,
        max: 70,
        unit: 'bar',
        decimals: 1,
      }),
      auto('combustion_pressure', 'Combustion pressure', '−3 to 3 bar', pressureNearZero('pressureCombustion')),
      manual('final_call', 'Final call', 'GO FOR FIRE'),
    ],
  },
  {
    id: 'postfire',
    label: '6. POSTFIRE',
    points: [
      auto('controller_state_postfire', 'Controller state', 'POSTFIRE', STATE_POSTFIRE),
      auto('servo_closed', 'Servo', 'CLOSED', SERVO_CLOSED),
      auto('safety_switch_safe', 'Safety switch', 'SAFE', SWITCH_SAFE),
      auto('tank_pressure', 'Tank pressure', 'BELOW 3 bar', pressureNearZero('pressureTank')),
      auto('combustion_pressure', 'Combustion pressure', 'BELOW 3 bar', pressureNearZero('pressureCombustion')),
      manual('waiting_time', 'Waiting time', 'ELAPSED'),
      manual('bottle_valve', 'Bottle valve', 'CLOSED'),
      manual('igniter_leads', 'Igniter leads', 'DISCONNECTED'),
      auto('controller_state_armed', 'Controller state', 'ARMED', STATE_ARMED),
    ],
  },
  {
    id: 'aborted',
    label: '7. ABORTED',
    points: [
      auto('controller_state_postfire', 'Controller state', 'POSTFIRE', STATE_POSTFIRE),
      manual('stand_area', 'Stand area', 'NOBODY AT STAND'),
      manual('rearming', 'Re-arming to close valve', 'SAFE TO DO SO'),
      auto('safety_switch_armed', 'Safety switch', 'ARMED', SWITCH_ARMED),
      auto('servo_closed', 'Servo', 'CLOSED', SERVO_CLOSED),
      auto('safety_switch_safe', 'Safety switch', 'SAFE', SWITCH_SAFE),
      auto('igniter_capacitors', 'Igniter capacitors (starter sense)', 'DRAINED, BELOW 0.5 V', STARTER_SENSE_LOW),
      manual('waiting_time', 'Waiting time', 'ELAPSED'),
      manual('bottle_valve', 'Bottle valve', 'CLOSED'),
      manual('igniter_leads', 'Igniter leads', 'DISCONNECTED'),
      auto('tank_pressure', 'Tank pressure', 'BELOW 3 bar', pressureNearZero('pressureTank')),
      auto('controller_state_armed', 'Controller state', 'ARMED', STATE_ARMED),
    ],
  },
  {
    id: 'secure_data',
    label: '8. SECURE DATA',
    points: [
      manual('blackbox_card', 'Blackbox card', 'REMOVED'),
      manual('csv_export', 'CSV export', 'SAVED'),
      manual('recording_file', 'Recording file', 'NEW'),
      manual('run_recording', 'Run recording', 'COPIED'),
      manual('calibration_file', 'Calibration file', 'KEPT'),
      manual('run_notes', 'Run notes', 'WRITTEN'),
      manual('controller', 'Controller', 'SHUT DOWN'),
      manual('laptop', 'Laptop', 'SHUT DOWN'),
      manual('battery_pack', 'Ground station battery pack', 'OFF'),
    ],
  },
];

export const CHECKLIST_DEFINITION_BY_ID: Record<string, ChecklistDefinition> =
  Object.fromEntries(CHECKLIST_DEFINITIONS.map((definition) => [definition.id, definition]));
