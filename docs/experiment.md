# Running an experiment

The software side of a test firing: what to prepare beforehand, where the procedure for the
day is, how the controller's states behave, and what to do with the data afterwards.

This covers the control and data system only. Engine assembly, oxidizer handling and site
safety have their own procedures.

## 1. Before leaving for the site

Do these where there is time and a desk. Each item links to its how-to.

- [ ] Controller flashed with the firmware you intend to use, with the site's WiFi name and
      the laptop's address in `.env` ([setup.md](setup.md), section 4).
- [ ] The matching ELF is published to the broker, and the file is on the laptop in case it
      has to be published again ([setup.md](setup.md), section 6).
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

## 2. On site

The whole day on site, from powering the ground station to shutting it down, is one
procedure: [checklists.md](checklists.md). It is worked through in the frontend's
**CHECKLIST** tab, and that file says for every step what to do, where to look and why.

It is the only place that defines the order of the steps. The other guides explain the
individual tasks it refers to.

## 3. Controller states

The controller is always in one of these states. The state is shown in **MASTER CONTROL** and
by the signal lights on the stand.

| State | Lights | Meaning | Leaves by |
| --- | --- | --- | --- |
| `ARMED` | green | idle, ready for commands | **FIRE**, **LAMP TEST**, **CAMERA TEST** |
| `COUNTDOWN` | red + buzzer | 10 seconds to ignition; camera recording started | timer → `FIRE`; **ABORT** or safety switch to safe → `POSTFIRE` |
| `FIRE` | red | igniter triggered for the first 3 seconds; burn in progress | **END FIRE** → `POSTFIRE` |
| `POSTFIRE` | red + green | igniter output safe; camera stopped | **RESET STATE** → `ARMED` |

Points that are easy to get wrong:

- `ARMED` is the idle state of the sequencer. It is present from boot. The **physical safety
  switch** is a separate thing with its own indicator, `SAFE` or `ARMED`.
- **FIRE** is accepted only in state `ARMED` with the safety switch armed. The button is grey
  otherwise and says what is missing.
- At the end of the countdown the controller checks the safety switch once more. If it is
  safe, there is no ignition and the state goes to `POSTFIRE`.
- `FIRE` does not end by itself. It lasts until someone presses **END FIRE**. The safety
  switch does not end it either, so that the camera keeps recording the burn.
- The igniter output is on only for the first 3 seconds of `FIRE`. The log then shows
  `Fire trigger released`. After that, arming the safety switch again does not fire the
  igniter.
- The countdown shown in the frontend runs on the laptop's clock from the moment the frontend
  saw the state change. It can be off by the network delay.
- The valve servo buttons are disabled during `FIRE`. **SHUTDOWN** is disabled during
  `COUNTDOWN` and `FIRE`.
- The camera gets its stop signal on entering `POSTFIRE`, but only within 58 seconds of the
  start of the countdown. After that the controller assumes the camera has stopped by itself
  and sends nothing.
- A rejected command is explained in the controller log, for example
  `FIRE rejected: safety switch not armed`. This is why the ELF matters.

## 4. Back at base

The data is secured on site, in list 8 of [checklists.md](checklists.md). Afterwards, image
and decode the blackbox card ([blackbox.md](blackbox.md), section 5) and archive the three
files together: the `.tsv` recording, the blackbox image, and the calibration.
