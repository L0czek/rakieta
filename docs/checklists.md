# Checklists

The procedure for an N2O hot fire, as the eight lists of the frontend's **CHECKLIST** tab.
Water tests are run manually and are not covered here.

This file is the reference for the content of the lists: what each step checks and why it is
where it is. The lists themselves live in `frontend/config/checklists.ts`.

> **Status: approved content, not yet implemented.** The frontend still holds three
> placeholder lists. The section [Implementation](#implementation) at the end says what has
> to be built. Once that is done, delete that section and this box; the rest of the file
> stays as documentation.

## How to read the lists

| Kind | Meaning |
| --- | --- |
| **A** | Auto-checked against telemetry. The step can be ticked only while the condition holds, unless it is overridden. |
| **A+** | Auto-checked, with a rule type the frontend does not have yet (WiFi RSSI, thermometers). |
| **M** | Manual confirmation. |

- **Item** and **Response** are what the frontend shows, in the style "Safety switch … SAFE".
- **Note** is documentation for this file only and is not displayed. Anything the operator
  must know at that moment is in the item or the response.
- *field* in a note means a value is typed in and stored with the step.
- Steps of a list are completed strictly in order. The lists are independent of each other,
  and each can be reset on its own.
- The checklist only observes. All actions are done on the dashboard or by hand. It does not
  gate the FIRE button.

Every A and A+ step can be **overridden**: completed although the condition does not hold,
after typing a reason. The reason is stored with the step, and the step shows as overridden
(amber, not green) on every connected frontend. The checklist cannot stop anything, so a hard
lock on a miscalibrated sensor would only make the operator abandon the list.

The reading itself is not stored with the step. Each step stores the controller time at
which it was completed, and the recording holds all telemetry, so the reading can be looked
up afterwards.

Ranges such as −3 to 3 bar are sanity checks: they catch a dead or disconnected sensor and
tolerate a zero offset. "BELOW 3 bar" means −3 to 3 bar as well.

At the start of a test day, press **RESET ALL CHECKLISTS** once, before list 1. Do not reset
everything later in the day: lists 1 to 4 hold the state of the set-up.

## Facts the steps rely on

Taken from the firmware and the board schematics.

1. The safety switch is the stand's 12 V power switch. In SAFE the servo, the signal lights
   and the igniter board are unpowered. Sensors and both I2C boards stay powered, and the
   stand battery voltage is readable in either position.
2. Servo status is the commanded position, not feedback. It shows `OPEN` even with the servo
   unpowered, and on arming the servo jumps to the last commanded position. So: servo
   `CLOSED` before every arming, and valve movement confirmed by eye.
3. Starter sense is clamped by a 3.3 V zener and measured through the igniter. Expected: about
   3 V with the switch armed and an intact igniter connected, about 0 V otherwise.
   The ranges used below (2.5–3.6 V and below 0.5 V) are from memory; confirm on the bench.
4. Controller state `ARMED` is the idle state. It is retained on the broker, so it shows with
   the controller off, and it shows even if the igniter or lamp board did not answer at boot
   (FIRE then does nothing). LAMP TEST is the proof that the sequencer runs.
5. Servo commands are rejected in state `FIRE`; the valve can be closed only after END FIRE.
   Nothing blocks the servo or SHUTDOWN during `COUNTDOWN`.
6. The tank pressure sensor is after the servo valve. It reads line pressure only while the
   servo is open, or while pressure is trapped between a closed servo and an intact injector
   plug.
7. The phone records only while its camera app is open and awake. The controller presses the
   shutter when FIRE is pressed (start of the countdown) and again at `POSTFIRE`.
8. The safety switch ends a `COUNTDOWN` (state goes to `POSTFIRE`) but does nothing to the
   state in `FIRE`: a burn that has started cannot be stopped, and leaving `FIRE` would stop
   the phone recording. The igniter is triggered only for the first 3 s of `FIRE`
   (`FIRE_TRIGGER_PULSE_MS`); the controller log then shows `Fire trigger released`. Arming
   the switch again within those 3 s fires the igniter again; later it does not. The rule
   stays: state `POSTFIRE` before the switch is armed again.
9. The igniter board's capacitors stay charged for a while after the switch goes to SAFE.
   According to the schematic, starter sense keeps reading their voltage through an intact
   igniter, so "starter sense below 0.5 V" in SAFE shows they have drained.
   **TBD: confirm on the bench, and how long it takes.**

## 1. GROUND STATION

First, because the checklist itself is served by the Docker stack: nothing can be ticked
before step 1 is true.

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | M | Docker stack | RUNNING | three services |
| 2 | M | Laptop external power | PRESENT |  |
| 3 | M | Router and antenna | POWERED |  |

Step 2: the laptop and the router both run from the battery pack in the ground station box
([setup.md](setup.md), section 1). The laptop must show its power input as present.

## 2. ASSEMBLY

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | M | Stand frame | STABLE AND VERTICAL |  |
| 2 | M | Flame deflector | IN PLACE |  |
| 3 | M | Safety switch | SAFE |  |
| 4 | M | Stand cable | CONNECTED BOTH ENDS | |
| 5 | M | Thermometer chain | CONNECTED | all sensors, including the engine ones |
| 6 | M | Antenna | AIMED AT STAND |  |
| 7 | M | Blackbox card | INSERTED | |
| 8 | M | Controller wake-up | DONE | plug in USB power |
| 9 | M | Controller red LED | ON |  |
| 10 | M | Packet clock | COUNTING |  |
| 11 | A | Safety switch | SAFE |  |
| 12 | M | Stand battery | CONNECTED |  |
| 13 | A+ | WiFi RSSI | ABOVE −75 dBm |  |
| 14 | M | Status log | READABLE | controller log lines |
| 15 | M | Blackbox activity LED | BLINKING | |
| 16 | M | Blackbox status LED | OFF | |
| 17 | M | Recording file | GROWING | |
| 18 | M | Phone and shutter cable | CONNECTED | phone on tripod |

Step 1: the frame is not anchored; it is held by its own weight.

Step 3 is manual: it must be done before the controller is woken, and until then the
frontend only shows the switch position retained from the last session. Step 11 repeats it
as an auto check once the controller reports the real position, before the stand battery
goes in.

Steps 4 and 5 must come before the controller is woken in step 8: the controller looks for
the igniter board, the lamp board and the thermometer chain once, when it starts (fact 4).
A thermometer plugged in later does not appear until the controller is restarted.

Steps 8 and 9: the controller is not switched on. It sleeps in shutdown mode and wakes when
USB power (the power bank) is plugged in ([setup.md](setup.md), section 7). The red LED on
the board shows that it woke up.

Step 10 proves the link: the packet clock counts only while telemetry arrives over WiFi and
the broker.

The blackbox is always connected and running; only the card moves. The card must have been
fully zeroed once and written by nothing but the blackbox since. Zeroing it again before a
run is optional: each power-up or card insertion appends a new session after the existing
ones.

## 3. STAND SETUP

No igniter and no propellant on the stand.

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | M | Calibration | MATCHES EXPORT |  |
| 2 | A | Stand battery | 11.5–13.5 V |  |
| 3 | A | Boost voltage | 11–13.5 V | sanity range; reads about 12.8 V |
| 4 | A | Tank pressure | −3 to 3 bar |  |
| 5 | A | Combustion pressure | −3 to 3 bar |  |
| 6 | A+ | Thermometers | −10 to 40 °C | at least 1 sensor |
| 7 | M | Tensometer | STEADY | field: reading |
| 8 | M | Igniter | NOT CONNECTED |  |
| 9 | A | Servo | CLOSED |  |
| 10 | A | Safety switch | ARMED |  |
| 11 | M | Signal light | GREEN |  |
| 12 | M | Lamp test | PASSED | green, red and buzzer for 2 s |
| 13 | A | Starter sense | BELOW 0.5 V |  |
| 14 | A | Servo | OPEN |  |
| 15 | M | Valve, by eye | OPEN | servo status is the command, not feedback |
| 16 | A | Servo | CLOSED |  |
| 17 | M | Valve, by eye | CLOSED |  |
| 18 | A | Safety switch | SAFE |  |
| 19 | M | Reference weight | RECORDED | field: tensometer reading |
| 20 | M | Camera test | CLIP RECORDED | open the camera app first |

Step 1 comes before the readings, because every range below depends on the calibration.

Step 6: the number of thermometers is not final. Replace "at least 1" with the exact count
once it is.

## 4. ENGINE SETUP

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | A | Safety switch | SAFE |  |
| 2 | A | Servo | CLOSED |  |
| 3 | M | Engine | MOUNTED | including plumbing, pressure line and thermometers |
| 4 | A+ | Thermometers | −10 to 40 °C | all sensors present, including those on the engine |
| 5 | M | Igniter | CONNECTED |  |
| 6 | A | Safety switch | ARMED |  |
| 7 | A | Starter sense | 2.5–3.6 V | igniter continuity |
| 8 | A | Safety switch | SAFE |  |

Step 4: the engine thermometers are already on the chain since ASSEMBLY and are only mounted
here. This step confirms that they all still answer after being handled. A sensor that was
unplugged and plugged back in needs a controller restart to appear again; that is harmless
here, because the clean start for the run comes later, in list 5.

## 5. FIRE

The hot part: from filling the tank to the final call. It can be reset and run again on its
own, for a refill after an abort or a second run.

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | M | Experiment name | RECORDED | field |
| 2 | M | Controller time | RECORDED | field |
| 3 | M | Recording file | NEW |  |
| 4 | M | Frontend history | CLEARED |  |
| 5 | A | Controller state | ARMED |  |
| 6 | A | Safety switch | SAFE |  |
| 7 | A | Servo | CLOSED |  |
| 8 | M | N2O bottle | FILLED | filled off the stand, on the scale; field: final weight |
| 9 | M | N2O bottle | CONNECTED | bottle valve still closed |
| 10 | M | Bottle valve | OPEN |  |
| 11 | A | Tank pressure | −3 to 3 bar | servo valve holds |
| 12 | M | Camera app | READY | slow motion; FIRE within 5 min |
| 13 | M | Personnel | CLEAR |  |
| 14 | A | Safety switch | ARMED |  |
| 15 | A | Starter sense | 2.5–3.6 V |  |
| 16 | A | Servo | OPEN |  |
| 17 | A | Tank pressure | 30–70 bar | about 60 expected |
| 18 | A | Combustion pressure | −3 to 3 bar | injector plug holds |
| 19 | M | Final call | GO FOR FIRE |  |

Steps 1 to 4 are the clean start for the run. They are here, after the engine is mounted and
right before the tank is filled, so that the recording does not hold the mounting work, one
recording file and one frontend history cover the filling and the burn, and nothing has to be
restarted with N2O on the stand. The name and the time come before the new recording file, so
that the file starts with them: each recording begins with the checklist state held by the
broker.

The list ends before the FIRE button: a step can be ticked only while its condition holds,
and `COUNTDOWN` lasts 10 s.

Step 12 is the last hands-on step at the stand. Android closes an idle camera app after
roughly 5 to 10 minutes, and checking much earlier drains the phone's battery. If more than
5 minutes pass between step 12 and FIRE, go back and repeat it.

Step 17: about 60 bar is expected. The lower limit is the lowest pressure worth firing at;
the upper limit is a sanity bound.

## 6. POSTFIRE

After a burn. For an attempt without a burn use list 7.

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | A | Controller state | POSTFIRE | press END FIRE |
| 2 | A | Servo | CLOSED | before the switch goes to safe |
| 3 | A | Safety switch | SAFE |  |
| 4 | A | Tank pressure | BELOW 3 bar |  |
| 5 | A | Combustion pressure | BELOW 3 bar |  |
| 6 | M | Waiting time | ELAPSED | suggested 5 min |
| 7 | M | Bottle valve | CLOSED |  |
| 8 | M | Igniter leads | DISCONNECTED |  |
| 9 | A | Controller state | ARMED | press RESET STATE |

## 7. ABORTED

After an attempt without a burn: ABORT pressed, safety switch flipped, or a misfire. The line
between the servo and the injector is treated as pressurised until step 12.

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | A | Controller state | POSTFIRE | after a misfire press END FIRE first |
| 2 | M | Stand area | NOBODY AT STAND | arming powers the igniter board and the servo again, with a full tank and an unfired igniter |
| 3 | M | Re-arming to close valve | SAFE TO DO SO | only with state POSTFIRE (step 1) |
| 4 | A | Safety switch | ARMED |  |
| 5 | A | Servo | CLOSED |  |
| 6 | A | Safety switch | SAFE |  |
| 7 | A | Igniter capacitors (starter sense) | DRAINED, BELOW 0.5 V | they stay charged after SAFE and the igniter is still wired to them |
| 8 | M | Waiting time | ELAPSED | suggested 10 min |
| 9 | M | Bottle valve | CLOSED |  |
| 10 | M | Igniter leads | DISCONNECTED |  |
| 11 | A | Tank pressure | BELOW 3 bar | after dismantling the line with a wrench |
| 12 | A | Controller state | ARMED | press RESET STATE |

Steps 2, 3 and 7 exist to put the reason in front of the operator: the re-arming decision
and the wait for the capacitors are spelled out as steps of their own. The capacitor
behaviour is fact 9 and still has to be confirmed on the bench.

The waiting times in lists 6 and 7 are suggestions without a firm basis. The steps are
manual and are not enforced by a timer.

How this fits the controller's states:

- **ABORT button.** State `POSTFIRE`, switch still armed, so step 4 is already green and
  **CLS** works at once.
- **Safety switch during the countdown.** State `POSTFIRE`, servo unpowered and still open.
  Step 4 powers it again; nothing moves, because the servo is still commanded open. FIRE is
  rejected in `POSTFIRE`, and the igniter trigger is reset on entering it.
- **Misfire, or switch flipped in `FIRE`.** The state stays `FIRE` (fact 8). Step 1 forces
  END FIRE before step 4 allows the switch to be armed again. The servo also needs it: it
  takes no commands in `FIRE` (fact 5).
- **RESET STATE is last** in both lists. After it the controller accepts FIRE again.
- **Link lost in `FIRE`.** END FIRE cannot be sent. The switch still cuts the igniter and
  servo power. The trigger is released 3 s into `FIRE` without the link (fact 8), so arming
  again would not fire the igniter, but it would not close the valve either. Wait for the
  link and state `POSTFIRE`, or restart the controller (it then starts in `ARMED` with the
  servo commanded closed).

## 8. SECURE DATA

| # | Kind | Item | Response | Note |
| --- | --- | --- | --- | --- |
| 1 | M | Blackbox card | REMOVED | label it; the blackbox stays on |
| 2 | M | CSV export | SAVED |  |
| 3 | M | Recording file | NEW | restarting the recorder closes the run's file |
| 4 | M | Run recording | COPIED |  |
| 5 | M | Calibration file | KEPT |  |
| 6 | M | Run notes | WRITTEN | name, controller time, anomalies |
| 7 | M | Controller | SHUT DOWN | SHUTDOWN, then unplug USB |
| 8 | M | Laptop | SHUT DOWN |  |
| 9 | M | Ground station battery pack | OFF |  |

Steps 8 and 9 cannot be ticked, because the frontend runs on the laptop. They are the
reminder of what comes last.

## Open points

Bench measurements that the values above still depend on:

- **Starter sense ranges** (fact 3): 2.5–3.6 V with an igniter connected and the switch
  armed, below 0.5 V otherwise. From memory, not measured.
- **Capacitor drain** (fact 9): that starter sense shows the igniter capacitors draining
  after the switch goes to SAFE, and how long it takes.
- **Thermometer count**: "at least 1" until the number of sensors is final.
- **Waiting times** in lists 6 and 7: suggestions without a firm basis.

## Implementation

*Delete this section once it is done.*

The checklist engine exists and stays: `frontend/config/checklists.ts` (definitions),
`frontend/types/checklist.ts` (types), `frontend/hooks/useChecklistEngine.ts` (order,
validation, completion, reset), `frontend/components/ChecklistView.tsx` (UI),
`frontend/hooks/useMqttSystem.ts` (retained MQTT state under
`checklist/<checklist>/points/<point>/state`). Its design is in
`frontend/docs/plans/2026-02-21-aviation-checklist-design.md`. Read `frontend/AGENTS.md`
first.

What has to be built:

1. **Content.** Replace the three placeholder lists in `frontend/config/checklists.ts` with
   lists 1 to 8 above, in this order, with these labels. Item maps to `callout`, Response to
   `response`. Do not set `note`: the view displays it, and the Note column here is not meant
   for the operator. Give every step an id that is unique within its list; several lists
   contain the same item more than once (for example "Safety switch").
2. **Fields.** Steps marked *field* get a typed-in value (`contextFields`): tensometer
   reading and reference weight reading in list 3; experiment name, controller time and N2O
   final weight in list 5. The value is stored only; nothing else reads it.
3. **Two new rule types.** WiFi RSSI above a limit (`wifiRssiDbm` in the telemetry), and
   thermometers: at least N sensors present and the latest value of every sensor inside a
   range (`temperatures` in the telemetry). N is 1 for now and must be easy to change.
4. **Override.** For every auto step, as described under "How to read the lists": a reason
   is typed in, the step completes, the stored state marks it as overridden, and it shows
   amber on all clients. This needs a new action in the engine, new fields in the stored
   step state (the payload parser in `useMqttSystem.ts` must accept old and new payloads),
   and UI in the active step.
5. **Tests.** The existing tests (`App.checklist.test.tsx`, `ChecklistView.test.tsx`,
   `useChecklistEngine.test.ts`, `useMqttChecklistTransport.test.ts`,
   `checklistTopics.test.ts`) use their own definitions or the placeholder ids; keep them
   passing and cover the new rule types and the override. Run
   `npm test` and `npm run typecheck` in `frontend/`.
6. **Docs.** Update the parts that describe the placeholder lists:
   `docs/experiment.md` (section "Checklists in the frontend", the firing sequence, and
   "RESET ALL CHECKLISTS" in the clean start, which contradicts the rule above),
   `frontend/README.md` and `frontend/DEV.md`. Point them here instead of repeating the
   lists.

Decided, do not reopen:

- No action buttons in the checklist. It only observes.
- Notes are not displayed.
- No hard-locked steps: every auto step can be overridden.
- List 5 ends before the FIRE button. There is no step for `COUNTDOWN` or `FIRE`.
- The retained state of the old placeholder lists stays on the broker; the frontend ignores
  topics of unknown lists.

Out of scope: anything in the controller or blackbox firmware.
