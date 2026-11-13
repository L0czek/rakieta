# Checklists

The procedure for an N2O hot fire day on site, from powering the ground station to shutting
it down. It is worked through in the frontend's **CHECKLIST** tab, as eight lists. This file
is the long form of those lists: for every step, what to do or where to look, and why the
step is where it is.

Water tests are run manually and are not covered here. What to prepare before leaving for
the site, and how the controller's states work, is in [experiment.md](experiment.md).

The lists themselves live in `frontend/config/checklists.ts`. Keep the two in step.

## The day at a glance

| | List | Covers | Ends with |
| --- | --- | --- | --- |
| 1 | [GROUND STATION](#1-ground-station) | laptop, Docker stack, router | the frontend is up, so steps can be ticked |
| 2 | [ASSEMBLY](#2-assembly) | stand, cables, controller, blackbox, recording | telemetry arrives and is recorded three ways |
| 3 | [STAND SETUP](#3-stand-setup) | sensors, lights, valve, camera; no igniter, no propellant | everything on the stand is proven to work |
| 4 | [ENGINE SETUP](#4-engine-setup) | engine mounted, igniter connected | igniter continuity confirmed, switch SAFE |
| 5 | [FIRE](#5-fire) | clean start, filling, arming, opening the valve | the final call |
| | [The burn](#the-burn) | FIRE button, countdown, END FIRE | state `POSTFIRE`, or an aborted attempt |
| 6 | [POSTFIRE](#6-postfire) | after a burn | stand safe to approach, state `ARMED` |
| 7 | [ABORTED](#7-aborted) | instead of 6, after an attempt without a burn | stand safe to approach, state `ARMED` |
| 8 | [SECURE DATA](#8-secure-data) | card, CSV, recording, notes, shutdown | everything powered down |

For another run on the same day see [A second run](#a-second-run-on-the-same-day).

Rules for the whole day:

- Press **RESET ALL CHECKLISTS** once, before list 1. Do not reset everything later in the
  day: lists 1 to 4 hold the state of the set-up.
- Always open the frontend on the laptop under the same address. The browser keeps the
  calibration and the history separately for each address
  ([setup.md](setup.md), section 5). After every page load, click the gear icon and
  **CONNECT** again; the frontend does not connect by itself.
- Keep phones off the frontend during the run. They load the WiFi router, and every
  connected frontend can send commands, including **FIRE**.
- Do not press **SIM** in the header while connected. The simulator then publishes invented
  telemetry to the real broker, where it mixes with the real data and is recorded.
- From list 5 until the data is secured in list 8, do not reboot the controller and do not
  touch the blackbox. A reboot does not lose data, but it splits the run across two time
  axes and puts the controller back into its start-up state.

## How to read the lists

| Kind | Meaning |
| --- | --- |
| **A** | Auto-checked against telemetry. The step can be ticked only while the condition holds, unless it is overridden. |
| **A+** | Auto-checked like A, with a rule of its own: WiFi RSSI above a limit, or thermometers (at least N sensors that have reported, and the latest value of every one in range). |
| **M** | Manual confirmation. |

- **Item** and **Response** are what the frontend shows, in the style "Safety switch … SAFE".
- **How** is what to do or where to look. It is in this file only; the frontend does not
  display it. Names in bold are panels and buttons of the frontend.
- *field* means a value is typed in and stored with the step.
- Steps of a list are completed strictly in order. The lists are independent of each other,
  and each can be reset on its own with **RESET CHECKLIST**.
- The checklist only observes. All actions are done on the dashboard or by hand. It does not
  gate the FIRE button.

Every A and A+ step can be **overridden**: completed although the condition does not hold,
after typing a reason and pressing **OVERRIDE STEP**. The reason is stored with the step,
and the step shows as overridden (amber, not green) on every connected frontend. The
checklist cannot stop anything, so a hard lock on a miscalibrated sensor would only make the
operator abandon the list.

The reading itself is not stored with the step. Each step stores the controller time at
which it was completed, and the recording holds all telemetry, so the reading can be looked
up afterwards.

A reading must also be fresh. Voltages, pressures and thermometers fail the check when
their latest value is more than 5 s older than the newest packet from the controller (the
controller sends the ADC channels every 100 ms and each thermometer once a second). The step
then shows `STALE`. This catches a sensor that stopped answering while the rest of the
telemetry goes on, for example a thermometer chain that was unplugged. It does not catch a
lost link, where everything stops together: watch the packet clock for that. The safety
switch, the servo, the controller state and the WiFi RSSI are sent only when they change, so
they have no such check.

Ranges such as −3 to 3 bar are sanity checks: they catch a dead or disconnected sensor and
tolerate a zero offset. "BELOW 3 bar" means −3 to 3 bar as well.

Notes below a list refer to the [facts](#facts-the-steps-rely-on) near the end of this file
as "fact 1" to "fact 9".

## 1. GROUND STATION

First, because the checklist itself is served by the Docker stack: nothing can be ticked
before step 1 is true.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | M | Docker stack | RUNNING | `docker compose up -d`, then `docker compose ps`: three services running. Open the frontend, gear icon, **CONNECT** |
| 2 | M | Laptop external power | PRESENT | the laptop shows its power input as present |
| 3 | M | Router and antenna | POWERED | laptop plugged into the router by cable |

Step 2: the laptop and the router both run from the battery pack in the ground station box
([setup.md](setup.md), section 1).

## 2. ASSEMBLY

From a bare stand to telemetry that arrives and is recorded.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | M | Stand frame | STABLE AND VERTICAL | |
| 2 | M | Flame deflector | IN PLACE | |
| 3 | M | Safety switch | SAFE | by eye, on the switch itself |
| 4 | M | Stand cable | CONNECTED BOTH ENDS | |
| 5 | M | Thermometer chain | CONNECTED | all sensors, including the engine ones |
| 6 | M | Antenna | AIMED AT STAND | |
| 7 | M | Blackbox card | INSERTED | a card that was zeroed ([blackbox.md](blackbox.md), section 3) |
| 8 | M | Controller wake-up | DONE | plug in USB power (the power bank) |
| 9 | M | Controller red LED | ON | on the controller board |
| 10 | M | Packet clock | COUNTING | `LAST PACKET T+…` in the header counts up steadily |
| 11 | A | Safety switch | SAFE | **SAFETY** indicator in **MASTER CONTROL** |
| 12 | M | Stand battery | CONNECTED | |
| 13 | A+ | WiFi RSSI | ABOVE −75 dBm | **CONTROLLER HEALTH**; re-aim the antenna if it is low |
| 14 | M | Status log | READABLE | **STATUS LOG** shows `DEFMT decoder ready for live log stream.` and then controller log lines |
| 15 | M | Blackbox activity LED | BLINKING | [blackbox.md](blackbox.md), section 4 |
| 16 | M | Blackbox status LED | OFF | a blinking status LED is an error code; same section |
| 17 | M | Recording file | GROWING | `ls -la recordings/`: the newest file's size grows |
| 18 | M | Phone and shutter cable | CONNECTED | phone on the tripod |

Step 1: the frame is not anchored; it is held by its own weight.

Step 3 is manual: it must be done before the controller is woken, and until then the
frontend only shows the switch position retained from the last session. Step 11 repeats it
as an auto check once the controller reports the real position, before the stand battery
goes in.

Steps 4 and 5 must come before the controller is woken in step 8: the controller looks for
the igniter board, the lamp board and the thermometer chain once, when it starts (fact 4).
A thermometer plugged in later does not appear until the controller is restarted.

Steps 8 and 9: the controller is not switched on. It sleeps in shutdown mode and wakes when
USB power is plugged in ([setup.md](setup.md), section 7). The red LED on the board shows
that it woke up.

Step 10 proves the link: the packet clock counts only while telemetry arrives over WiFi and
the broker.

Step 14: without readable log lines a rejected command cannot be explained later. If the
lines do not decode, the broker does not hold the ELF of the firmware that is running;
publish it again ([setup.md](setup.md), section 6).

Steps 15 to 17 are the two recordings that do not depend on the browser. A recorder that
cannot write to `recordings/` fails without any sign in the frontend
([data-and-history.md](data-and-history.md), section 1).

The blackbox is always connected and running; only the card moves. The card must have been
fully zeroed once and written by nothing but the blackbox since. Zeroing it again before a
run is optional: each power-up or card insertion appends a new session after the existing
ones.

## 3. STAND SETUP

Everything on the stand is exercised once, with no igniter and no propellant on it.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | M | Calibration | MATCHES EXPORT | **CONFIGURATION**: compare with the exported `conversion-settings.json`; if they differ, **IMPORT JSON** |
| 2 | A | Stand battery | 11.5–13.5 V | **POWER SYSTEMS** |
| 3 | A | Boost voltage | 11–13.5 V | **POWER SYSTEMS**; sanity range, reads about 12.8 V |
| 4 | A | Tank pressure | −3 to 3 bar | **PRESSURES** |
| 5 | A | Combustion pressure | −3 to 3 bar | **PRESSURES** |
| 6 | A+ | Thermometers | −10 to 40 °C | **THERMAL SENSORS**; at least 1 sensor, all at ambient temperature |
| 7 | M | Tensometer | STEADY | *field*: the reading |
| 8 | M | Igniter | NOT CONNECTED | |
| 9 | A | Servo | CLOSED | servo panel; press **CLS** if it is not |
| 10 | A | Safety switch | ARMED | **SAFETY** indicator in **MASTER CONTROL** follows the switch |
| 11 | M | Signal light | GREEN | |
| 12 | M | Lamp test | PASSED | **LAMP TEST** in **MASTER CONTROL**: green, red and buzzer for 2 s, then back to green |
| 13 | A | Starter sense | BELOW 0.5 V | **POWER SYSTEMS** |
| 14 | A | Servo | OPEN | **OPN** in the servo panel; status goes `OPENING`, then `OPEN` |
| 15 | M | Valve, by eye | OPEN | servo status is the command, not feedback |
| 16 | A | Servo | CLOSED | **CLS**; status goes `CLOSING`, then `CLOSED` |
| 17 | M | Valve, by eye | CLOSED | |
| 18 | A | Safety switch | SAFE | |
| 19 | M | Reference weight | RECORDED | hang the reference weight; *field*: the tensometer reading |
| 20 | M | Camera test | CLIP RECORDED | open the camera app first, then **CAMERA TEST**: records for 5 s; check that the clip exists |

Step 1 comes before the readings, because every range below depends on the calibration. The
calibration lives in the browser and on the broker, and is lost with either
([calibration.md](calibration.md), section 2).

Step 6: the number of thermometers is not final. Once it is, set
`REQUIRED_THERMOMETER_COUNT` in `frontend/config/checklists.ts` to the exact count and
replace "at least 1" here.

Step 9 comes before arming because the servo jumps to the last commanded position when it
gets power (fact 2).

Steps 12 and 20: **LAMP TEST** and **CAMERA TEST** work only in state `ARMED`. The lamp test
is also the proof that the sequencer runs and the lamp board answers (fact 4).

Step 13: with the switch armed and no igniter connected, starter sense reads about 0 V
(fact 3). Compare with list 4, step 7.

Steps 14 to 17 move the valve once in each direction and confirm it by eye, because the
servo status only repeats the command (fact 2).

## 4. ENGINE SETUP

The engine goes on the stand and the igniter is connected. From step 5 on there is a live
igniter on the stand.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | A | Safety switch | SAFE | |
| 2 | A | Servo | CLOSED | |
| 3 | M | Engine | MOUNTED | including plumbing, pressure line and thermometers |
| 4 | A+ | Thermometers | −10 to 40 °C | **THERMAL SENSORS**: all sensors present, including those on the engine |
| 5 | M | Igniter | CONNECTED | |
| 6 | A | Safety switch | ARMED | |
| 7 | A | Starter sense | 2.5–3.6 V | **POWER SYSTEMS**; igniter continuity |
| 8 | A | Safety switch | SAFE | |

Steps 1 and 2 are repeated from the end of list 3, because time may have passed and the
igniter is about to be connected.

Step 4: the engine thermometers are already on the chain since ASSEMBLY and are only mounted
here. This step confirms that they all still answer after being handled: a sensor that has
gone silent fails it as stale. A sensor that was unplugged and plugged back in needs a
controller restart to appear again; that is harmless here, because the clean start for the
run comes later, in list 5.

Steps 6 to 8 arm the stand only for as long as it takes to read the igniter: about 3 V
through an intact igniter (fact 3).

## 5. FIRE

The hot part: from the clean start and filling the tank to the final call. It can be reset
and run again on its own.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | M | Experiment name | RECORDED | *field* |
| 2 | M | Controller time | RECORDED | *field*: `LAST PACKET T+…` from the header; write the wall-clock time next to it in the run notes |
| 3 | M | Recording file | NEW | `docker compose restart mqtt-recorder` |
| 4 | M | Frontend history | CLEARED | **ANALYSIS**, bottom of **DATA CONTROL**: **Clear History** |
| 5 | A | Controller state | ARMED | **MASTER CONTROL** |
| 6 | A | Safety switch | SAFE | |
| 7 | A | Servo | CLOSED | |
| 8 | M | N2O bottle | FILLED | filled off the stand, on the scale; *field*: final weight |
| 9 | M | N2O bottle | CONNECTED | bottle valve still closed |
| 10 | M | Bottle valve | OPEN | |
| 11 | A | Tank pressure | −3 to 3 bar | **PRESSURES**; the servo valve holds |
| 12 | M | Camera app | READY | slow motion; **FIRE** within 5 min |
| 13 | M | Personnel | CLEAR | |
| 14 | A | Safety switch | ARMED | |
| 15 | A | Starter sense | 2.5–3.6 V | **POWER SYSTEMS** |
| 16 | A | Servo | OPEN | **OPN** in the servo panel |
| 17 | A | Tank pressure | 30–70 bar | about 60 expected |
| 18 | A | Combustion pressure | −3 to 3 bar | the injector plug holds |
| 19 | M | Final call | GO FOR FIRE | |

Before step 1: if the controller needs a restart (a thermometer that was plugged back in, or
a fresh time base), restart it now, with the safety switch SAFE, and wait for telemetry.
Not later.

Steps 1 to 4 are the clean start for the run. They are here, after the engine is mounted and
right before the tank is filled, so that the recording does not hold the mounting work, one
recording file and one frontend history cover the filling and the burn, and nothing has to be
restarted with N2O on the stand. The name and the time come before the new recording file, so
that the file starts with them: each recording begins with the checklist state held by the
broker.

Step 2: the controller time next to the wall-clock time lets you match the charts to video
and notes later.

Step 4: use **Clear History**, not the browser's "Clear site data", which also deletes the
calibration ([data-and-history.md](data-and-history.md), section 3). Export anything you
still need from an earlier run first.

Step 11: the tank pressure sensor is after the servo valve (fact 6). With the bottle open
and the servo closed it must stay near zero.

Step 12 is the last hands-on step at the stand. Android closes an idle camera app after
roughly 5 to 10 minutes, and checking much earlier drains the phone's battery. If more than
5 minutes pass between step 12 and FIRE, go back and repeat it.

Step 17: about 60 bar is expected. The lower limit is the lowest pressure worth firing at;
the upper limit is a sanity bound.

The list ends before the FIRE button: a step can be ticked only while its condition holds,
and `COUNTDOWN` lasts 10 s.

## The burn

Not a list: there is no time to tick steps. The states are described in
[experiment.md](experiment.md), section 3.

1. Press **FIRE** in **MASTER CONTROL**. It is accepted only in state `ARMED` with the safety
   switch armed; otherwise the button is grey and says what is missing.
2. State `COUNTDOWN`: red light and buzzer, 10 seconds. The phone starts recording.
   **To stop: ABORT in the frontend, or the safety switch to safe.** Either one ends the
   countdown in state `POSTFIRE`; continue with list 7.
3. State `FIRE`: ignition. The igniter is triggered for the first 3 seconds. From here the
   burn cannot be stopped (fact 8).
4. When the burn is over, press **END FIRE**. State `POSTFIRE`; the phone stops recording.
   `FIRE` does not end by itself.
5. Continue with list 6 after a burn, or with list 7 if the engine did not ignite.

If the link drops, the frontend shows the connection as red and the values freeze. The
controller keeps its state and reconnects by itself, and the blackbox keeps recording
throughout. The physical safety switch works without the link. For a link lost in state
`FIRE` see the end of [list 7](#7-aborted).

## 6. POSTFIRE

After a burn. For an attempt without a burn use list 7.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | A | Controller state | POSTFIRE | press **END FIRE** |
| 2 | A | Servo | CLOSED | **CLS**, before the switch goes to safe |
| 3 | A | Safety switch | SAFE | |
| 4 | A | Tank pressure | BELOW 3 bar | |
| 5 | A | Combustion pressure | BELOW 3 bar | |
| 6 | M | Waiting time | ELAPSED | suggested 5 min |
| 7 | M | Bottle valve | CLOSED | |
| 8 | M | Igniter leads | DISCONNECTED | |
| 9 | A | Controller state | ARMED | press **RESET STATE** |

Step 1 comes first because the servo takes no commands in state `FIRE` (fact 5).

Step 2 comes before step 3 because the servo is unpowered once the switch is safe (fact 1).

Step 9 is last: after **RESET STATE** the controller accepts **FIRE** again.

## 7. ABORTED

After an attempt without a burn: ABORT pressed, safety switch flipped, or a misfire. The line
between the servo and the injector is treated as pressurised until step 12.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | A | Controller state | POSTFIRE | after a misfire press **END FIRE** first |
| 2 | M | Stand area | NOBODY AT STAND | arming powers the igniter board and the servo again, with a full tank and an unfired igniter |
| 3 | M | Re-arming to close valve | SAFE TO DO SO | only with state `POSTFIRE` (step 1) |
| 4 | A | Safety switch | ARMED | |
| 5 | A | Servo | CLOSED | **CLS** |
| 6 | A | Safety switch | SAFE | |
| 7 | A | Igniter capacitors (starter sense) | DRAINED, BELOW 0.5 V | **POWER SYSTEMS**; they stay charged after SAFE and the igniter is still wired to them |
| 8 | M | Waiting time | ELAPSED | suggested 10 min |
| 9 | M | Bottle valve | CLOSED | |
| 10 | M | Igniter leads | DISCONNECTED | |
| 11 | A | Tank pressure | BELOW 3 bar | after dismantling the line with a wrench |
| 12 | A | Controller state | ARMED | press **RESET STATE** |

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

Before anything is powered down, in this order. The first step protects the copy that is
easiest to destroy.

| # | Kind | Item | Response | How |
| --- | --- | --- | --- | --- |
| 1 | M | Blackbox card | REMOVED | label it; the blackbox stays on |
| 2 | M | CSV export | SAVED | **ANALYSIS**: export the whole run; each boot, if the controller rebooted |
| 3 | M | Recording file | NEW | `docker compose restart mqtt-recorder` closes the run's file |
| 4 | M | Run recording | COPIED | from `recordings/` to a second medium |
| 5 | M | Calibration file | KEPT | the `conversion-settings.json` that was active with the run |
| 6 | M | Run notes | WRITTEN | name, controller time, anomalies |
| 7 | M | Controller | SHUT DOWN | **SHUTDOWN** in **MASTER CONTROL**, then unplug USB |
| 8 | M | Laptop | SHUT DOWN | `docker compose down` first |
| 9 | M | Ground station battery pack | OFF | |

Step 1: the card comes out before the blackbox can be powered up again. A blackbox with old
firmware starts every session at the beginning of the card and overwrites the previous one
([blackbox.md](blackbox.md), section 2); with the card out, either firmware is safe.

Step 2: how to export is in [data-and-history.md](data-and-history.md), section 3.

Step 7: if USB is plugged in when **SHUTDOWN** is sent, the shutdown takes effect when it is
unplugged ([setup.md](setup.md), section 7).

Steps 8 and 9 cannot be ticked, because the frontend runs on the laptop. They are the
reminder of what comes last.

What to do with the files back at base is in [experiment.md](experiment.md), section 4.

## A second run on the same day

After list 6 or 7 of the previous run:

1. Secure the previous run: list 8, steps 1 to 6. Stop there; steps 7 to 9 are for the end of
   the day. The CSV must be exported before list 5 clears the history.
2. Put a card into the blackbox: a second zeroed card, or the first one after copying it
   off and zeroing it.
3. Reset lists 4 to 8, each with **RESET CHECKLIST**. Do not use **RESET ALL CHECKLISTS**:
   lists 1 to 3 still hold.
4. Continue with list 4. Lists 6 and 7 end with the igniter leads disconnected, so the
   igniter has to be connected and checked again.

For a refill after an abort with the engine and the igniter untouched, the same applies:
list 7 disconnects the igniter leads, so list 4 comes before list 5.

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

## Open points

Bench measurements that the values above still depend on:

- **Starter sense ranges** (fact 3): 2.5–3.6 V with an igniter connected and the switch
  armed, below 0.5 V otherwise. From memory, not measured.
- **Capacitor drain** (fact 9): that starter sense shows the igniter capacitors draining
  after the switch goes to SAFE, and how long it takes.
- **Thermometer count**: "at least 1" until the number of sensors is final.
- **Waiting times** in lists 6 and 7: suggestions without a firm basis.
