# Calibration

The controller never converts anything. It sends raw 12-bit ADC readings, and so does the
blackbox. All conversion to bar, kg and volts happens in the frontend, using the
**conversion settings** described here. A wrong calibration therefore never damages the
recorded data: the raw values can be converted again later.

## 1. Where the calibration is stored

There are four places. Knowing which one wins is the key to not losing settings.

| # | Place | Lifetime | Written when |
| --- | --- | --- | --- |
| 1 | Defaults in the code: `getDefaultConversionSettings()` in `frontend/utils/conversions.ts` | permanent, in git | you edit the file and rebuild the frontend |
| 2 | The browser's `localStorage`, key `rocket.conversions.settings` | until the browser's site data is cleared; separate for each browser and each address the frontend is opened under | on save, import, reset, and whenever a calibration arrives over MQTT |
| 3 | Retained MQTT topic `config/conversions/state` | kept in the broker's Docker volume `mosquitto-data`; survives restarts, deleted by `docker compose down -v` | on save, import and reset, if the frontend is connected |
| 4 | A JSON file from **EXPORT JSON** | as long as you keep the file | when you click the button |

How they interact:

- A browser with nothing stored uses the code defaults (1).
- When a frontend connects and the broker holds a calibration (3), that calibration
  **replaces** the browser's own copy (2) immediately and without asking. The same happens
  to every connected frontend when someone saves. This is how several screens stay in sync.
- When the broker holds no calibration, each browser keeps using its own copy. Nothing
  publishes it back by itself. Two browsers can then silently show different values for the
  same raw data.
- The recorder captures topic (3) like any other, so every recording contains the calibration
  that was on the broker when the recording started, plus every later change.

## 2. Preserving the settings

Do this after every calibration change:

1. In **CONFIGURATION**, click **SAVE SETTINGS**. The status line under the buttons shows
   `SAVED & PUBLISHED`.
2. Click **EXPORT JSON** and keep the downloaded `conversion-settings.json`. Commit it to the
   repository if it is the calibration to use from now on.
3. If the values should become the defaults for a fresh browser, also copy them into
   `getDefaultConversionSettings()` and rebuild the frontend.

If the frontend is disconnected, the status line shows
`SAVED IN THIS BROWSER ONLY — MQTT DISCONNECTED, NOT PUBLISHED`. The settings are then stored
in this browser but not on the broker; connect and **IMPORT JSON** an export to publish them.

**EXPORT JSON** exports the last *saved* settings. Unsaved edits in the form are not included.

### Restoring a lost calibration

The broker keeps the calibration across restarts. It is gone after `docker compose down -v`,
on a freshly set up laptop, or when a replay has overwritten it with a recorded one. To put it
back:

1. Open the frontend and connect.
2. In **CONFIGURATION**, click **IMPORT JSON** and choose the exported file.

Import saves and publishes in one step. **SAVE SETTINGS** cannot be used for this, because it
is disabled while the form has no changes.

An import fills any field that is missing or invalid in the file with the code default,
without a warning. After importing an old file, read the form once.

### Recovering the calibration from a recording

```bash
grep -P '\tconfig/conversions/state\t' recordings/<file>.tsv \
  | tail -1 | cut -f5 | xxd -r -p | jq .settings > conversion-settings.json
```

The result can be loaded with **IMPORT JSON**.

## 3. What the settings mean

Every analog channel goes through two steps: raw ADC value to voltage at the ADC pin, then
voltage to a physical value.

### Step 1: ADC LUT (raw value to millivolts)

Each channel has its own lookup table of points `(raw ADC 0–4095, millivolts)`. Values
between points are interpolated linearly. The default is a straight line from `(0, 0)` to
`(4095, 1162)`: the ESP32 ADC reference of this particular chip, taken from its factory
calibration. Add points to a channel's table to correct non-linearity. A table needs at least
two points.

### Step 2: voltage to physical value

| Channel | Formula | Settings (default) |
| --- | --- | --- |
| Tensometer | `kg = V × divider × kg/V` | divider ratio (5.047), kg/V (43.478) |
| Tank pressure | see below | divider (3.15), shunt (4.7 Ω), amp gain (50), bar/mA (10) |
| Combustion pressure | see below | divider (3.1), shunt (4.7 Ω), amp gain (50), bar/mA (10) |
| Stand battery | `V × divider` | 14.316 |
| Computer battery | `V × divider` | 5.624 |
| Boost voltage | `V × divider` | 13.717 |
| Starter sense | `V × divider` | 3.136 |

The pressure sensors are 4–20 mA current-loop transmitters. The frontend reverses the
measurement chain:

```
V at ADC          = LUT(raw)
V at amp output   = V at ADC × divider ratio
V across shunt    = V at amp output / amp gain
loop current (mA) = V across shunt / shunt Ω × 1000
pressure (bar)    = (loop current − 4 mA) × bar/mA
```

`bar/mA` is the sensor's range divided by 16 mA: 10 for a 160 bar sensor.

The tensometer has only a slope. There is no zero offset setting, so a reading at no load
cannot be tared in the frontend.

Temperatures and the servo angle have no settings; their conversion is fixed.

## 4. Calibrating

Open **CONFIGURATION**. The page has three panels: the conversion settings form, the ADC LUT
editor, and **PRESSURE DEBUG**.

### Pressure channels

**PRESSURE DEBUG** shows, for the latest sample of each pressure channel, every intermediate
value of the chain above. It recalculates with the values currently in the form, before you
save them, so you can tune and watch.

1. With the sensor at ambient pressure, look at the **Current** column. A healthy loop reads
   4 mA at zero pressure.
2. Adjust the channel's **DIVIDER RATIO** until **Current** reads 4.000 mA and **Pressure**
   reads 0.
3. Apply a known pressure (test pump with a reference gauge) and compare **Pressure**. If the
   zero is right and the span is off, correct **BAR/mA**.
4. **SAVE SETTINGS**, then export (section 2).

`— no data —` in the table means no sample has arrived on that channel since the page loaded.

### Tensometer

1. Hang a known weight on the load cell and read the tensometer value on the dashboard.
2. Correct the slope: `new kg/V = old kg/V × true weight / displayed weight`.
3. Save and export.

### Voltages

Measure the real voltage with a multimeter and compare it with the dashboard:
`new divider = old divider × measured voltage / displayed voltage`. Save and export.

### Buttons

| Button | Effect |
| --- | --- |
| **SAVE SETTINGS** | applies the form, stores it in the browser, publishes it |
| **REVERT CHANGES** | discards unsaved edits |
| **EXPORT JSON** | downloads the saved settings |
| **IMPORT JSON** | loads a file, saves and publishes it |
| **RESET TO DEFAULTS** | replaces everything with the code defaults, saves and publishes. All connected frontends lose the previous calibration; export first |

If someone else saves while you have unsaved edits, the status line shows
`REMOTE UPDATE RECEIVED — DRAFT KEPT`. Your form is untouched, and saving it will overwrite
their change.

## 5. Calibration and already-recorded data

A calibration change applies to data that arrives **after** it. The frontend converts each
sample once, on arrival, and stores the converted value in its history. Old points in the
charts and in CSV exports keep the calibration that was active when they arrived.

To re-convert an experiment with a corrected calibration, replay its recording into an empty
frontend. See "Re-converting with a new calibration" in
[data-and-history.md](data-and-history.md).
