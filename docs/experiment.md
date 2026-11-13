# Running an experiment

The software side of a test firing, in order: what to prepare beforehand, how to check the
system on site, the firing sequence, and how to secure the data afterwards.

This covers the control and data system only. Engine assembly, oxidizer handling and site
safety have their own procedures.

## 1. Before leaving for the site

Do these where there is time and a desk. Each item links to its how-to.

- [ ] Controller flashed with the firmware you intend to use, with the site's WiFi name and
      the laptop's address in `.env` ([setup.md](setup.md), section 4).
- [ ] The matching ELF file is on the laptop, and you know its path. It has to be republished
      on site ([setup.md](setup.md), section 6).
- [ ] Calibration checked, saved, and exported to `conversion-settings.json` on the laptop
      ([calibration.md](calibration.md), section 2).
- [ ] Docker images built: `docker compose up --build -d` has run once on this laptop. The
      site may have no internet.
- [ ] Full dry run done once on the bench: telemetry in the frontend, controller log lines in
      the status log, a growing file in `recordings/`, and a blackbox card decoded
      successfully ([blackbox.md](blackbox.md), section 4).
- [ ] Blackbox SD card copied off and zeroed ([blackbox.md](blackbox.md), section 3).
- [ ] Old recordings copied off the laptop; free disk space available.
- [ ] Laptop, controller battery, stand battery and blackbox battery charged.

## 2. Bring-up on site

Bring the system up in this order. Each step depends on the ones before it.

1. **Network.** Power the WiFi router and the dish router, aim the dish at the test stand,
   plug the laptop into the router by cable.
2. **Ground station.** `docker compose up -d`, then `docker compose ps`: three services
   running.
3. **Frontend.** On the laptop open the frontend, gear icon, **CONNECT**. Use the same address
   as always, so that the stored calibration is the one you expect.
4. **ELF.** Publish it. The status log shows `Loaded retained firmware ELF …`.
5. **Calibration.** In **CONFIGURATION**, **IMPORT JSON** with your exported file. The broker
   was just started, so it holds no calibration until you do this.
6. **Blackbox.** Insert the zeroed card and power the blackbox.
7. **Controller.** Power it. Within seconds the dashboard shows live values, and the status
   log shows `DEFMT decoder ready for live log stream.` followed by controller log lines.

Keep phones off the frontend during the run; they load the WiFi router.

Do not press **SIM** in the header while connected. The simulator then publishes invented
telemetry to the real broker, where it mixes with the real data and is recorded.

## 3. System check

Go through all of these before any propellant is on the stand.

### Telemetry

| Check | Where | Expect |
| --- | --- | --- |
| Link quality | **CONTROLLER HEALTH** | WiFi RSSI and CPU values present and updating |
| Packet clock | `LAST PACKET T+…` in the header | counting up steadily |
| Stand battery | **POWER SYSTEMS** | 11.5–13.5 V |
| Computer battery, boost voltage | **POWER SYSTEMS** | plausible, boost near 12 V |
| Pressures | dashboard | near zero with the system unpressurized |
| Tensometer | dashboard | steady; changes when the reference weight is hung on it |
| Temperatures | **THERMAL SENSORS** | all sensors listed, at ambient temperature |
| Controller log | **STATUS LOG** | readable lines, no decoder errors |

### Actuators and indicators

All of these work only in state `ARMED`.

| Check | Action | Expect |
| --- | --- | --- |
| Signal lights | **LAMP TEST** | green, red and buzzer on for 2 seconds, then back to green |
| Camera | **CAMERA TEST** | recording starts, stops after 5 seconds; check that a clip exists |
| Valve servo | **OPN**, then **CLS** in the servo panel | status goes `OPENING` → `OPEN`, then `CLOSING` → `CLOSED`; the valve moves |
| Safety switch | flip to armed and back | the indicator in **MASTER CONTROL** follows: `ARMED` / `SAFE` |

Leave the servo **closed** and the safety switch **safe**.

### Data paths

| Check | How |
| --- | --- |
| MQTT recording | the newest file in `recordings/` is growing ([data-and-history.md](data-and-history.md), section 1) |
| Blackbox | status LED off, activity LED blinking, and it goes dark when the stream is interrupted ([blackbox.md](blackbox.md), section 4) |
| Frontend history | **ANALYSIS** in PAUSED mode shows the last minutes |

## 4. Clean start for the run

Right before the firing procedure starts, so that each data store holds this experiment and
nothing else:

1. If the controller was rebooted since the check, or you want a fresh time base, reboot it
   now and wait for telemetry. Not later.
2. `docker compose restart mqtt-recorder` — a new recording file for this run.
3. Empty the frontend history ([data-and-history.md](data-and-history.md), section 3). If the
   controller was rebooted, the frontend demands this anyway.
4. In **CHECKLIST**, **RESET ALL CHECKLISTS**.
5. Write down the controller time (`LAST PACKET T+…`) next to the wall-clock time. It lets
   you match the charts to video and notes later.

From here on **do not reboot the controller** and do not power-cycle the blackbox until the
data is secured (section 6).

## 5. Firing

### States

The controller is always in one of these states. The state is shown in **MASTER CONTROL** and
by the signal lights on the stand.

| State | Lights | Meaning | Leaves by |
| --- | --- | --- | --- |
| `ARMED` | green | idle, ready for commands | **FIRE**, **LAMP TEST**, **CAMERA TEST** |
| `COUNTDOWN` | red + buzzer | 10 seconds to ignition; camera recording started | timer → `FIRE`; **ABORT** or safety switch to safe → `POSTFIRE` |
| `FIRE` | red | igniter triggered | **END FIRE** → `POSTFIRE` |
| `POSTFIRE` | red + green | igniter output safe; camera stopped | **RESET STATE** → `ARMED` |

Points that are easy to get wrong:

- `ARMED` is the idle state of the sequencer. It is present from boot. The **physical safety
  switch** is a separate thing with its own indicator, `SAFE` or `ARMED`.
- **FIRE** is accepted only in state `ARMED` with the safety switch armed. The button is grey
  otherwise and says what is missing.
- At the end of the countdown the controller checks the safety switch once more. If it is
  safe, there is no ignition and the state goes to `POSTFIRE`.
- `FIRE` does not end by itself. It lasts until someone presses **END FIRE**.
- The countdown shown in the frontend runs on the laptop's clock from the moment the frontend
  saw the state change. It can be off by the network delay.
- The valve servo buttons are disabled during `FIRE`. **SHUTDOWN** is disabled during
  `COUNTDOWN` and `FIRE`.
- The camera gets its stop signal on entering `POSTFIRE`, but only within 58 seconds of the
  start of the countdown. After that the controller assumes the camera has stopped by itself
  and sends nothing.
- A rejected command is explained in the controller log, for example
  `FIRE rejected: safety switch not armed`. This is why the ELF matters.

### Checklists in the frontend

**CHECKLIST** offers three lists. Steps must be completed in order; a step with an automatic
condition can be completed only while the condition holds.

| List | Steps |
| --- | --- |
| PRE-FLIGHT | experiment name (typed in) · safety switch `SAFE` · controller state `ARMED` |
| PRESSURIZATION | tank pressure 40–50 bar · main valve servo `CLOSED` · operator confirmation |
| FIRING | combustion pressure 0–2 bar · safety switch `ARMED` · final call |

These lists are defined in `frontend/config/checklists.ts`. They cover only what the software
can see and are not the complete procedure.

### Sequence

1. Work through PRE-FLIGHT and PRESSURIZATION.
2. Everyone clear. Safety switch to **armed**. Work through FIRING.
3. Open the valve with **OPN** when the procedure calls for it; wait for `OPEN`.
4. Press **FIRE**. State `COUNTDOWN`, red light and buzzer, 10 seconds.
   - To stop: **ABORT** in the frontend, or the safety switch to safe.
5. State `FIRE`: ignition.
6. When the burn is over, press **END FIRE**. State `POSTFIRE`.
7. Close the valve with **CLS**. Safety switch to **safe**.
8. Leave the state in `POSTFIRE` until the stand is safe to approach, then **RESET STATE**.

If the link drops during the run, the frontend shows the connection as red and the values
freeze. The controller keeps its state and reconnects by itself; the blackbox keeps recording
throughout. The physical safety switch works without the link.

## 6. Securing the data

Do this before powering anything down, in this order. The first step protects the copy that
is easiest to destroy.

1. **Blackbox:** power it off, take the card out, label it. Powering it up again with the
   card inside overwrites the recording from the start ([blackbox.md](blackbox.md),
   section 2).
2. **Frontend:** in **ANALYSIS**, export the CSV for the whole run
   ([data-and-history.md](data-and-history.md), section 3). This copy is lost with the next
   controller reboot.
3. **Recording:** `docker compose restart mqtt-recorder` to close the run's file, then copy
   that file from `recordings/` to a second medium.
4. **Calibration:** keep the `conversion-settings.json` that was active with the run.
5. **Notes:** the experiment name, the controller time noted in section 4, and anything
   unusual.
6. Only now shut the controller down (**SHUTDOWN** in MASTER CONTROL) and stop the stack
   (`docker compose down`).

Back at base, image and decode the blackbox card ([blackbox.md](blackbox.md), section 5) and
archive the three files together: the `.tsv` recording, the blackbox image, and the
calibration.

## 7. Between two runs on the same day

Repeat section 4 (clean start) after securing the data of the previous run. In particular:

- a second blackbox card, or copy and zero the first one;
- a new recording file;
- CSV exported before the controller is rebooted.
