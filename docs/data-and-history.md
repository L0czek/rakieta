# Recording, replay and history

The same measurements end up in three independent places. Each has a different purpose.

| Store | Contents | Where | Survives |
| --- | --- | --- | --- |
| **MQTT recording** | every MQTT message, raw | `recordings/*.tsv` on the laptop | everything except loss of the radio link or of the laptop |
| **Frontend history** | converted values, for charts and CSV export | the browser's IndexedDB | page reloads and controller reboots; not clearing the browser's site data |
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

### One file per experiment

A recording can span any number of controller reboots; the frontend keeps the boots apart
when the file is replayed (section 3). Starting a new file before each experiment is still
worthwhile, because it keeps the files small and each one about a single run:

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
3. Empty the frontend history (section 3, "Emptying the history") if you want it to hold this
   recording only. Without that, the replay is stored next to what is already there: as a new
   boot when its timestamps start below the newest stored one, or appended to the current
   boot when they happen to continue past it.
4. Open the frontend and **CONNECT**.
5. Replay, with either of the two scripts (see "The two replay scripts" below):

   ```bash
   scripts/.venv/bin/python scripts/replay-mqtt.py recordings/20260906T155835Z.tsv
   ```

   ```bash
   scripts/replay-mqtt.sh recordings/20260906T155835Z.tsv
   ```

   Optional second and third arguments are the broker host and port (default
   `127.0.0.1:1883`).
6. Wait for `Replayed N messages …, skipped M on cmd/#.` The Python script then takes another
   11 seconds to ask the broker whether any messages were dropped.
7. In **ANALYSIS**, switch **LIVE** to **PAUSED** and browse or export (section 3). A
   recording that contains controller reboots shows up as several boots in the boot selector.

### The two replay scripts

Both publish every recorded line to its original topic with the original QoS and retain
flag, in file order, and both skip `cmd/#`. They differ in speed and in what they need.

| | `replay-mqtt.py` | `replay-mqtt.sh` |
| --- | --- | --- |
| Needs | Python 3 with the `paho-mqtt` package | `mosquitto_pub` and `xxd` |
| How | one broker connection for the whole file | a new `mosquitto_pub` process and connection per message |
| Speed | tens of thousands of messages per second: an hour of recording in well under a minute | a few hundred messages per second: an hour of recording in ten minutes or more |
| Rate limit | none by default; `--rate N` caps it at N messages per second | none; it cannot go faster |
| Lost-message check | yes | no |

Set up the Python script once (this needs internet access):

```bash
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install -r scripts/requirements.txt
```

The script finishes when the broker has taken every message. The frontend may still be
working through them for a while after that; wait until `LAST PACKET T+…` in its header stops
advancing before you export.

**Why a fast replay is safe.** A subscriber that reads more slowly than the replay sends, such
as a browser, leaves a backlog on the broker. Mosquitto by default keeps only 1,000 waiting
messages per subscriber and silently drops the rest, which leaves holes in the frontend
history with no sign that anything is missing. `mosquitto.conf` in this repository removes
that limit (`max_queued_messages 0`), so the broker keeps the backlog in memory until the
frontend has caught up. In a test, the frontend stored 60 % of an unthrottled replay with the
default limit and all of it with the limit removed.

**The lost-message check.** After the replay, the Python script reads the broker's counter of
dropped messages and compares it with the value from before. If it went up, the script says
how many messages were dropped and exits with an error. This matters when you replay into a
broker that does not use this repository's configuration: fix the broker's limit, or clear
the frontend history and replay again with `--rate`. The counter covers all subscribers, so a
slow client other than your frontend also trips it. `--no-drop-check` skips the check and the
11-second wait.

### What replay does and does not do

- Recorded wall-clock times are ignored. The charts are placed by the controller timestamps
  inside the payloads, so the result is the same at any replay speed.
- The countdown clock in the frontend is meaningless during a replay.
- Each controller reboot in the recording raises the **CONTROLLER REBOOTED** banner, as it
  would live. Dismiss it.
- A recording that was started while the controller was off begins with the controller's old
  retained state. On replay this can appear as an extra boot holding a single servo sample.
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
3. `scripts/.venv/bin/python scripts/replay-mqtt.py /tmp/replay.tsv`
4. Export the CSV.

## 3. Frontend history

### How the frontend stores data

- Every sample is converted to physical units on arrival and kept in memory for the live
  charts (about the last five seconds of the fast channels).
- Twice a second the new samples are written to the browser database `rocket_telemetry_db`
  (IndexedDB), at full resolution. Nothing is thinned out.
- Samples are stored per **controller boot**. Controller time restarts at zero when the
  controller reboots, so each boot has its own time axis (see "Controller reboots" below).
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
| Boot selector | chooses which controller boot to look at. It appears once more than one boot is stored; the one receiving data is marked `(CURRENT)`. Choosing an earlier boot switches to PAUSED; **LIVE** returns to the current one |
| Slider | moves the window through the stored time range of the selected boot (PAUSED only; moving it switches to PAUSED) |
| Zoom in / out | halves or doubles the window, from 1 s to 600 s |
| Series buttons | show or hide each channel |
| `CURSOR: T+…` | start of the window, in controller milliseconds |

Time on the charts is controller time: seconds since the controller booted, for the selected
boot.

### Exporting to CSV

At the bottom of **DATA CONTROL** in **ANALYSIS**:

1. Enter **Begin (s)** and **End (s)** in controller seconds, or click
   **Use Displayed Window** to take over the range currently on the chart.
2. Click **Export CSV**.

The file `telemetry_pandas_boot<N>_<begin>_<end>.csv` contains every stored channel of the
selected boot in that range, whatever is visible on the chart, in long format:

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

### Controller reboots

Controller time is "milliseconds since the controller booted", so it starts again from zero
after a reboot. When a packet arrives more than one second older than the newest one, the
frontend takes that as a reboot and:

- closes the history of the boot so far and starts a new boot, numbered one higher;
- clears the live charts, which then show the new boot;
- shows a red **CONTROLLER REBOOTED** banner until you dismiss it, and writes a line to the
  status log;
- stays connected. Commands keep working.

Nothing is deleted. Earlier boots remain in the boot selector in **ANALYSIS** and can be
browsed and exported like the current one. If you were looking at a paused chart when the
reboot happened, the view stays on the boot you were inspecting.

The banner matters for more than the charts: a rebooted controller is back in state `ARMED`
with the valve servo closed, whatever it was doing before. Check the state before continuing.

Boot numbers are local to one browser. They count the reboots this browser has seen since its
history was last cleared, and say nothing about how often the controller really started.

Limits:

- A boot that lasted only a few seconds can go unnoticed, because the next boot's first
  packets are then not more than a second older. Its samples are merged into the following
  boot.
- Data that arrives while the page is closed is not stored, and a reboot during that time is
  noticed only when the page is open again.

### Emptying the history

In **ANALYSIS**, at the bottom of **DATA CONTROL**, click **Clear History** and confirm. This
deletes the stored samples of all boots in this browser, resets the live charts, and starts
again at boot 1. It does not touch the
calibration, the MQTT recordings or the blackbox, and it does not disconnect: data that
arrives afterwards is stored again.

Do not use the browser's "Clear site data" for this. It also deletes the calibration stored
in this browser.

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
