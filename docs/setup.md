# Setup

How to bring the whole system up from a fresh checkout: the ground station (MQTT broker,
recorder, web frontend), the controller firmware, and the firmware ELF that the frontend
needs to show controller logs.

## 1. How the pieces connect

```
 test stand                                   ground station
┌──────────────────┐   WiFi   ┌────────────┐       ┌─────────────┐  cable  ┌────────────────────┐
│ controller       │ ) ) ) ) )│ directional│───────│ WiFi router │─────────│ laptop             │
│ (ESP32-C6)       │          │ dish router│       └─────────────┘         │  mosquitto  :1883  │
│  └ blackbox (SD) │          └────────────┘         ( ( ( phones          │  (websocket :8000) │
└──────────────────┘                                 (discouraged)         │  mqtt-recorder     │
                                                                           │  frontend   :3000  │
                                                                           └────────────────────┘
```

- The **controller** stands a distance away at the test stand. It joins the WiFi network
  served by the directional dish and connects to the MQTT broker on the laptop. It publishes
  raw sensor data and listens for commands.
- The **directional dish router** is aimed at the test stand and is connected to the WiFi
  router.
- The **laptop** is wired to the WiFi router. It runs three Docker Compose services: the
  Mosquitto broker, a recorder that dumps all MQTT traffic to `recordings/`, and the web
  frontend.
- The **frontend** runs in a browser, talks to the broker over WebSocket, converts raw ADC
  values to physical units, and keeps its own history in the browser. **Use the browser on
  the laptop.** Phones on the router's WiFi can open the frontend too, but each one receives
  the full telemetry stream over WiFi and loads the router, so keep them off during a run.
- The **blackbox** is independent of all of the above: it records the controller's UART
  stream to an SD card. See [blackbox.md](blackbox.md).

The controller must be able to reach the laptop on TCP port 1883 across the dish and the
router.

### Ground station power

The ground station runs from one box with a battery pack (a power bank with a barrel jack
output), which powers both the WiFi router and the laptop. The laptop's internal battery is
only a reserve.

After plugging in, check that the laptop actually sees the power input and is not running
on its internal battery: the battery indicator shows "plugged in" or "charging".

A laptop that silently runs on its internal battery can shut down in the middle of a run and
take the broker, the recorder and the frontend with it.

## 2. Prerequisites on the laptop

| Tool | Needed for |
| --- | --- |
| Docker with the Compose plugin | broker, recorder, frontend |
| `rustup` | building the controller firmware and the host tools (the pinned nightly toolchain installs itself) |
| `probe-rs` | flashing the controller (`cargo run` calls it) |
| `st-flash` (package `stlink-tools`) | flashing the blackbox |
| `mosquitto_pub` (package `mosquitto-clients`) | publishing the firmware ELF, replaying recordings with `replay-mqtt.sh` |
| `xxd` | replaying recordings with `replay-mqtt.sh` |
| Python 3 with `paho-mqtt` | replaying recordings with the faster `replay-mqtt.py` ([data-and-history.md](data-and-history.md), section 2) |

Clone with submodules:

```bash
git clone <repo-url> rakieta
cd rakieta
git submodule update --init --recursive
```

## 3. Start the ground station

```bash
docker compose up --build -d
```

The first build takes a while because it compiles the log decoder to WebAssembly.

| Service | Port | Purpose |
| --- | --- | --- |
| `mqtt` | 1883 (MQTT), 8000 (MQTT over WebSocket) | broker, anonymous access |
| `mqtt-recorder` | none | writes every message to `recordings/<UTC time>.tsv` |
| `frontend` | 3000 | web UI |

Check that it works:

1. `docker compose ps` shows three running services.
2. A new file appears in `recordings/`.
3. `http://<laptop>:3000` loads.

Three things to know about the broker:

- Retained messages (the firmware ELF, the calibration, the checklist state, the controller's
  last state) are stored in the Docker volume `mosquitto-data` and survive restarts of the
  container and of the laptop. The broker writes them to disk when it shuts down and once a
  minute while running, so a hard power cut can lose the last minute of changes.
  `docker compose down -v` deletes the volume and with it everything retained.
- It never drops messages for a subscriber that falls behind (`max_queued_messages 0`); it
  holds them in memory until the subscriber catches up. This keeps a briefly stalled frontend
  from losing live telemetry and makes fast replays safe
  ([data-and-history.md](data-and-history.md), section 2).
- The recorder writes as user `1000:1000`. If `recordings/` is not writable by that user, the
  recorder restarts in a loop and nothing is recorded.

## 4. Configure and flash the controller

### 4.1 Network settings

The settings are compiled into the firmware. Create `esp32-mainboard/.env`:

```bash
cd esp32-mainboard
cp .env.example .env
```

| Variable | Meaning |
| --- | --- |
| `WIFI_SSID`, `WIFI_PASSWORD` | the network served by the directional dish |
| `MQTT_HOST` | the laptop, as an IP address or a name the network's DNS resolves |
| `MQTT_PORT` | broker TCP port; 1883 if unset. Keep 1883 unless you change the port in `docker-compose.yml` |
| `MQTT_USER`, `MQTT_PASSWORD` | leave empty; the broker is anonymous |

Give the laptop a fixed address (DHCP reservation or static IP), because a
changed address means rebuilding and reflashing.

`WIFI_SSID`, `WIFI_PASSWORD` and `MQTT_HOST` are mandatory. The firmware builds without them,
but the flashing step refuses it with
`Firmware was compiled without complete device configuration; refusing to flash`.

### 4.2 Build and flash

Connect the controller by USB, then:

```bash
cd esp32-mainboard
cargo run --release --bin test-stand-controller
```

This builds the firmware, flashes it with `probe-rs`, and stays attached printing the
controller's log. Press Ctrl-C to detach; the firmware keeps running. Use `--release`: a
debug build flashes, but with a warning.

The ELF file that matches what you just flashed is:

```
esp32-mainboard/target/riscv32imac-unknown-none-elf/release/test-stand-controller
```

### 4.3 What the controller does at boot

- Drives the valve servo to **closed**.
- Starts in state `ARMED` with the green light on. `ARMED` is the name of the sequencer's idle
  state; it is not the position of the physical safety switch.
- Looks for the hardware on the stand cable **once**: the igniter board, the signal light
  board and the chain of thermometers. Nothing is detected again later.
  - A thermometer that is plugged into the chain after start does not appear until the
    controller is restarted. If the chain does not answer at start, no temperatures are sent
    at all.
  - If the igniter board or the signal light board does not answer at start, the sequencer
    does not run: the state still shows `ARMED`, but FIRE, LAMP TEST and the other state
    commands do nothing.

  So connect the stand cable and every thermometer **before** starting the controller, and
  restart the controller after changing any of them.
- Connects to WiFi and the broker and reconnects by itself whenever the link drops.
- Counts time from zero. Every timestamp in the system is "milliseconds since the controller
  booted", so a reboot restarts the clock. This matters for the frontend history, see
  [data-and-history.md](data-and-history.md).

## 5. Open the frontend and connect

1. Open `http://<laptop>:3000`.
2. Click the gear icon in the header. Host defaults to the host in the address bar and port to
   `8000`. Click **CONNECT**.
3. The indicator in the top right turns green.

The frontend does not connect by itself: after every page load you click the gear and
**CONNECT** again. The host and port are remembered.

On the laptop, always open the frontend under the **same address** (for example always
`http://localhost:3000`). The browser keeps the calibration and the telemetry history
separately for each address, so `http://localhost:3000` and `http://192.168.1.10:3000` are
two unrelated stores.

A phone opens `http://<laptop IP>:3000` and connects the same way. Every connected frontend
can send commands, including **FIRE**.

With a controller online you should see, within a few seconds, live values on the dashboard,
a state in **MASTER CONTROL**, and CPU and WiFi RSSI numbers in **CONTROLLER HEALTH**.

## 6. Publish the firmware ELF

The controller sends its log in a compact binary format (`defmt`) on the topic `log/defmt`.
The log text is not in that stream; it is in the firmware ELF file. The frontend therefore
needs the ELF of the exact build that is running, and gets it from the retained topic
`shared/firmware/test_stand_controller/elf`.

Publish it from the repository root:

```bash
scripts/publish-test-stand-elf.sh \
  esp32-mainboard/target/riscv32imac-unknown-none-elf/release/test-stand-controller
```

The script takes the broker host and port as optional second and third arguments (default
`127.0.0.1:1883`).

Check in the frontend **STATUS LOG** panel:

| Line in the status log | Meaning |
| --- | --- |
| `Waiting for retained firmware ELF on …` | connected, no ELF on the broker yet |
| `Loaded retained firmware ELF from … (N bytes).` | ELF received |
| `DEFMT decoder ready for live log stream.` | logs will now decode |
| `Failed to initialize DEFMT decoder: …` or `DEFMT stream decode failed: …` | the ELF does not match the running firmware |

Once the decoder is ready, controller log lines such as `CPU: busy …‰, idle …‰` appear every
five seconds.

Publish the ELF again:

- after **every flash**, because the ELF must match the build byte for byte;
- after `docker compose down -v` or on a new laptop, because the broker's stored copy is gone.

The broker keeps the ELF across restarts, so an ELF from an older build stays there until you
replace it.

Without a matching ELF everything else still works: telemetry, commands and charts do not
depend on it. You only lose the controller's log lines, which include the reasons for rejected
commands (`FIRE rejected: safety switch not armed`).

Each recording starts with a copy of the ELF (about 12 MB), so a recording can be replayed
later with working logs.

## 7. Day-to-day operations

| Task | Command |
| --- | --- |
| Start everything | `docker compose up -d` |
| Stop everything | `docker compose down` |
| Rebuild after changing the frontend or the submodule | `docker compose up --build -d` |
| Start a new recording file | `docker compose restart mqtt-recorder` |
| Watch raw traffic | `mosquitto_sub -h <laptop> -t '#' -v` |
| Shut the controller down | **SHUTDOWN** in MASTER CONTROL, or `esp32-mainboard/scripts/send_shutdown_mqtt.sh <laptop>` |

**SHUTDOWN** puts the charger into shipping mode and the CPU into deep sleep. The controller
wakes up only when a USB cable is plugged in. If a USB cable is plugged in when you send the
command, the shutdown takes effect when you unplug it.

## 8. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Frontend stays red after CONNECT | wrong host, or port 8000 not reachable from the browser's machine |
| Connected, but no telemetry | controller not on the network, or `MQTT_HOST` does not point to the laptop. Attach with `cargo run` and read the log: it prints `MQTT resolving host: …` and the session errors |
| Red **CONTROLLER REBOOTED** banner | the controller restarted, so its clock began again. The history continues as a new boot; see [data-and-history.md](data-and-history.md) |
| Status log shows `DEFMT decoder WebAssembly package is unavailable` | the frontend was built without the decoder; rebuild with `docker compose up --build` |
| Values are present but wrong | calibration, see [calibration.md](calibration.md) |
