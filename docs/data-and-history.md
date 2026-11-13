# Recording, replay and history

The same measurements end up in three independent places. Each has a different purpose.

| Store | Contents | Where | Survives |
| --- | --- | --- | --- |
| **MQTT recording** | every MQTT message, raw | `recordings/*.tsv` on the laptop | everything except loss of the radio link or of the laptop |
| **Frontend history** | converted values, for charts and CSV export | the browser's IndexedDB | page reloads; **not** a controller reboot |
| **Blackbox** | raw sensor stream | SD card at the test stand | loss of the radio link; see [blackbox.md](blackbox.md) |

The MQTT recording is the master copy on the ground. The frontend history is a working view
that can always be rebuilt from a recording.

## 1. Recording

### How it works

The `mqtt-recorder` service subscribes to every topic and appends each message to
`recordings/<UTC start time>.tsv`. It runs whenever the Compose stack runs; there is nothing
to switch on.

One line is one message, with five tab-separated fields:

```
<unix time with nanoseconds>  <topic>  <qos>  <retain flag>  <payload as hex>
```

A **new file** starts every time the recorder container starts: on `docker compose up`, on
`docker compose restart mqtt-recorder`, and when the broker restarts (the recorder loses its
connection, exits, and is restarted).

Each file begins with the retained messages that were on the broker at that moment: the
firmware ELF (about 12 MB), the calibration, the checklist state, and the controller's last
state, servo and safety-switch messages. A file is therefore self-contained. It also means no
file is smaller than the ELF.

`recordings/` is ignored by git. Copy the files somewhere safe yourself.

### Verify that it is recording

```bash
ls -la recordings/             # the newest file's size grows while the controller is online
docker compose logs mqtt-recorder
```

Do this before every experiment. A recorder that cannot write to `recordings/` fails without
any sign in the frontend.

### One file per controller boot

Controller timestamps restart from zero at every controller boot. A recording that spans a
reboot cannot be replayed into the frontend in one go: the frontend stops at the point where
time jumps back (section 3).

Start a new file after every controller boot and before every experiment:

```bash
docker compose restart mqtt-recorder
```

## 2. Replaying a recording

Replay publishes the recorded messages to a broker again. The frontend treats them like live
data, so it rebuilds its charts and history from the recording.

### Procedure

1. **Make sure no controller is connected to the broker you replay into.** Replay on a
   machine away from the test stand, or with the controller powered off. Commands (`cmd/#`)
   are never replayed, so a connected controller would not fire. But its live telemetry would
   mix with the recorded telemetry, and the replayed state messages would make the frontend
   show a state the real controller is not in.
2. Start the stack: `docker compose up -d`.
3. Empty the frontend history (section 3, "Emptying the history"). Old history with higher
   timestamps makes the frontend reject the replay.
4. Open the frontend and **CONNECT**.
5. Replay:

   ```bash
   scripts/replay-mqtt.sh recordings/20260906T155835Z.tsv
   ```

   Optional second and third arguments are the broker host and port (default
   `127.0.0.1:1883`).
6. Wait for `Replayed N messages, skipped M on cmd/#.`
7. In **ANALYSIS**, switch **LIVE** to **PAUSED** and browse or export (section 3).

### What replay does and does not do

- It runs as fast as the broker accepts, about 500 messages per second, several times faster
  than real time. Recorded wall-clock times are ignored; the charts are placed by the
  controller timestamps inside the payloads, so the result is the same.
- The countdown clock in the frontend is meaningless during a replay.
- Retained messages are replayed as retained. After a replay the broker holds the **recorded**
  ELF, calibration and checklist state, not the ones it had before. Every connected frontend
  takes over the recorded calibration. To get the current one back, **IMPORT JSON** your
  exported calibration ([calibration.md](calibration.md)) and publish the current ELF again.
- The recorder is running during a replay, so the replay itself is written to a new recording
  file. Delete that file afterwards.

### Re-converting with a new calibration

The recording holds raw ADC values, and the frontend converts them as they arrive. To apply a
corrected calibration to an old experiment, replay it without its recorded calibration:

```bash
grep -vP '\tconfig/conversions/state\t' recordings/<file>.tsv > /tmp/replay.tsv
```

1. Empty the frontend history.
2. Connect, and set the calibration you want (**IMPORT JSON** or edit and **SAVE SETTINGS**).
3. `scripts/replay-mqtt.sh /tmp/replay.tsv`
4. Export the CSV.

## 3. Frontend history

### How the frontend stores data

- Every sample is converted to physical units on arrival and kept in memory for the live
  charts (about the last five seconds of the fast channels).
- Twice a second the new samples are written to the browser database `rocket_telemetry_db`
  (IndexedDB), at full resolution. Nothing is thinned out.
- The database belongs to one browser on one machine, under one address. Another browser, a
  phone, or the same browser under a different URL has its own, separate history, containing
  only what it received while it was open and connected.
- The history holds samples only. The status log, the sequencer state and the checklist are
  not part of it.
- Data arrives only while the page is open and connected. Samples sent while the page was
  closed are not fetched later; they exist only in the MQTT recording.

After a page reload the history is still there: open **ANALYSIS** and it is browsable without
connecting.

### Browsing

In **ANALYSIS**:

| Control | Function |
| --- | --- |
| **LIVE / PAUSED** | LIVE follows the newest data from memory. PAUSED reads the visible window from the database |
| Slider | moves the window through the whole stored time range (PAUSED only; moving it switches to PAUSED) |
| Zoom in / out | halves or doubles the window, from 1 s to 600 s |
| Series buttons | show or hide each channel |
| `CURSOR: T+…` | start of the window, in controller milliseconds |

Time on the charts is controller time: seconds since the controller booted.

### Exporting to CSV

At the bottom of **DATA CONTROL** in **ANALYSIS**:

1. Enter **Begin (s)** and **End (s)** in controller seconds, or click
   **Use Displayed Window** to take over the range currently on the chart.
2. Click **Export CSV**.

The file `telemetry_pandas_<begin>_<end>.csv` contains every stored channel in that range,
whatever is visible on the chart, in long format:

```
timestamp_ms,sensor_id,value
12000,pressureTank,48.31
12000,tensometer,0.42
```

`sensor_id` is one of `tensometer` (kg), `pressureTank`, `pressureCombustion` (bar),
`batteryStand`, `batteryComputer`, `boostVoltage`, `starterSense` (V), `servo` (degrees), or a
temperature sensor number such as `1` (°C).

```python
import pandas as pd
df = pd.read_csv("telemetry_pandas_0_60000.csv")
wide = df.pivot_table(index="timestamp_ms", columns="sensor_id", values="value")
```

The values carry the calibration that was active when each sample arrived
([calibration.md](calibration.md), section 5).

### Controller reboots: `TIME TRAVEL DETECTED`

The history is indexed by controller time, which restarts at zero when the controller
reboots. The frontend cannot place new data from "second 5" into a history that already
reaches "second 3000". When a packet arrives more than one second older than the newest
stored one, the frontend disconnects and shows:

```
CRITICAL FAILURE — TIME TRAVEL DETECTED. Received: …, System Last: …
```

The only button is **WIPE DATA & RESET**, which deletes the history in this browser. The MQTT
recording and the blackbox are not affected.

To keep the old history before wiping:

1. Reload the page and **do not connect**. The lockout is gone and the history is intact.
2. Open **ANALYSIS**, export the CSV.
3. Connect. The lockout appears again; now click **WIPE DATA & RESET**.

The same lockout appears, for the same reason, when you replay a recording into a frontend
that still holds newer history, and when a recording spans a controller reboot.

Rule of thumb: **export before you reboot the controller**, and start each experiment with an
empty history.

### Emptying the history

There is no button for this outside the lockout screen. In the browser's developer tools
(F12) open **Application → Storage → IndexedDB**, select `rocket_telemetry_db`, and delete it;
then reload the page.

Do not use "Clear site data" for this. It also deletes the calibration stored in this browser.

## 4. Checklist state

The **CHECKLIST** view is synchronized between all connected frontends through retained
topics `checklist/<checklist>/points/<point>/state`. It is recorded and replayed like
everything else, and the broker keeps it across restarts. Text entered in a checklist step
(for example the experiment name) is stored only there.

## 5. Which copy to use

| Situation | Use |
| --- | --- |
| Quick look right after the run | frontend **ANALYSIS**, CSV export |
| Radio link dropped during the run | blackbox |
| Calibration was wrong during the run | replay the recording with the corrected calibration |
| Need the controller's log or the exact command timing | the recording (`log/defmt`, `cmd/#`, `status/#`) |
| Archive | the `.tsv` recording, the blackbox image, and the exported `conversion-settings.json` |
