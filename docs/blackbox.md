# Blackbox

The blackbox is a separate, battery-powered board that writes everything the controller
sends on a dedicated UART line to a microSD card. It does not depend on WiFi, the broker or
the laptop, so it is the copy of the data that survives a lost radio link.

## 1. What it records

The controller sends the blackbox the same raw measurements it publishes over MQTT:

| Data | Rate |
| --- | --- |
| Tensometer, tank pressure, combustion pressure (raw ADC) | every 1 ms |
| Stand battery, computer battery, boost voltage, starter sense (raw ADC) | once per 100 ms batch |
| Temperatures (raw), one packet per sensor reading | as measured |
| Safety switch position | on change |
| Servo position | on change |
| Timing sync (controller time in ms) | every 100 ms |

Not recorded: the sequencer state (`ARMED`, `FIRE`, …), commands, and the controller's log.
Values are raw; convert them with the calibration from [calibration.md](calibration.md).

The stream is about 7–8 kB/s, roughly 30 MB per hour.

## 2. Behaviour you must know

These are properties of the current firmware. Each one can cost you the data.

1. **Every start begins writing at the start of the card.** Powering the blackbox up, or
   pulling the card out and pushing it back in, starts a new session at sector 0 and
   overwrites the previous one. After an experiment, power the blackbox off and take the card
   out **before** anything else. Do not power it up again with that card until the data is
   copied.
2. **The card is used raw, without a filesystem.** A computer shows it as unformatted. Do not
   let the operating system "fix" or format it. Read it with the decoder (section 5).
3. **Old data is not erased by a new session.** A short session written over a long one
   leaves the tail of the long one behind it. Zero the card before each experiment
   (section 3) so that one card holds exactly one session.
4. **The last 2 KiB may be missing.** Data is written in 2 KiB blocks, and a partly filled
   block is not flushed when the stream stops. At 8 kB/s that is at most the last quarter
   second before the controller stopped sending.
5. **An overrun stops recording until reset.** If the card is too slow, the blackbox raises
   the overrun error (8 blinks, section 4) and writes nothing more until it is power-cycled.
   A power cycle starts over at sector 0 (point 1).
6. **The button does nothing.**

## 3. Preparing the card

Zero the card before each experiment, on the laptop:

```bash
lsblk                       # find the card, for example /dev/sdX; check the size
cd esp32-mainboard/tools/blackbox-decoder
cargo build --release
sudo target/*/release/blackbox-decoder format --quick /dev/sdX
```

The tool is built as your user and only the built binary runs with `sudo`, which it needs to
write to the card.

- `format` overwrites the device with zeros and asks for confirmation first. **It destroys
  whatever device you name.** Check the device with `lsblk` every time.
- `--quick` stops at the first 1 MiB block that is already zero. It is the right choice for a
  card that has only ever been used in the blackbox. Without `--quick` the whole card is
  written, which takes long on a large card.
- Copy the previous experiment off the card first (section 5).

## 4. Verifying that the blackbox works

### LEDs

The board has two LEDs.

**Status LED** — off when there is no error. With an error it blinks a count, pauses three
seconds, and repeats. The count is the sum of the active errors:

| Blinks | Error |
| --- | --- |
| 1 | SD card missing, removed, or failing |
| 2 | blackbox battery below 3.3 V |
| 4 | card full |
| 8 | UART overrun; recording has stopped |

For example 3 blinks = card problem + low battery.

**Activity LED** — blinks once per second while UART data is arriving, and goes dark about
one second after the data stops. It is dark after power-up until the first byte arrives.

1. Insert a zeroed card and power the blackbox. Both LEDs off.
2. Power the controller. The activity LED starts blinking.
3. Power the controller off or unplug the blackbox data line. The activity LED goes dark
   within about a second.

The activity LED shows that bytes arrive, not that they are written. With an error on the
status LED (missing card, overrun) it can blink while nothing is recorded, so always read
both LEDs: **activity blinking and status dark** is the healthy state.

Interrupting the stream does not restart the session; only power-cycling the blackbox or
reseating the card does.

### Full check: read the card back

The LEDs do not show whether the recorded bytes are valid. Before an experiment that
matters, do a dry run:

1. Zero the card, start the blackbox and the controller, let it record for a minute.
2. Flip the safety switch once and open and close the servo, so there are events to find.
3. Power the blackbox off, take the card out, and decode it (section 5).
4. Check that the output has `timing_sync` lines with increasing `timestamp_ms`, `fast_adc`
   lines 1 ms apart, a `digital` line for the switch and `servo` lines, and that the warning
   count is small.
5. Zero the card again before the real run.

### If nothing is received

Flash the controller with the UART test firmware, which sends an incrementing counter on the
blackbox line and nothing else:

```bash
cd esp32-mainboard
cargo run --release --bin blackbox-uart-counter
```

The link is 3,000,000 baud, 8N1, from controller pin `D4`. Flash `test-stand-controller`
again afterwards and publish its ELF ([setup.md](setup.md), section 6).

## 5. Reading the data

Copy the card to an image file first, so that the only copy of the experiment is not the
card:

```bash
lsblk
sudo dd if=/dev/sdX of=experiment.img bs=1M status=progress
```

This copies the whole card. To copy less, add `count=<megabytes>`; one hour of recording is
about 30 MB.

Decode the image:

```bash
cd esp32-mainboard/tools/blackbox-decoder
cargo run --release -- decode /path/to/experiment.img > experiment.ndjson
```

Output is one JSON object per line. Warnings and the final `decoded N packets` go to stderr.

```json
{"type":"experiment_separator"}
{"type":"timing_sync","timestamp_ms":1000,"fast_interval_ms":1}
{"type":"fast_adc","timestamp_ms":1000,"tensometer":11,"tank":22,"combustion":33}
{"type":"slow_adc","timestamp_ms":1000,"bat_stand":1,"bat_comp":2,"boost":3,"starter":4}
{"type":"temperature","timestamp_ms":1000,"sensor_id":1,"value":6400}
{"type":"digital","timestamp_ms":1000,"value":1}
{"type":"servo","timestamp_ms":1000,"ticks":2500}
```

| Field | Meaning |
| --- | --- |
| `timestamp_ms` | controller time, milliseconds since its boot; the same clock as MQTT and the frontend |
| `tensometer`, `tank`, `combustion`, `bat_*`, `boost`, `starter` | raw ADC, 0–4095 |
| `temperature.value` | raw sensor word; °C = (signed 16-bit value ÷ 4) × 0.015625 |
| `digital.value` | safety switch: 1 = armed, 0 = safe |
| `servo.ticks` | pulse width, 500 = 0°, 2500 = 180° |
| `experiment_separator` | start-of-session marker written by the blackbox |

What to expect in a healthy decode:

- The first line is `experiment_separator`.
- A few warnings right after it (`unknown packet id`, `dropping … before first timing sync`):
  the recording starts in the middle of a packet, and the decoder locks on at the first
  timing sync.
- One `truncated packet … resynchronizing` near the end, where the stream stops.
- Timestamps that jump backwards mean the controller rebooted during the session.

Only the fast ADC lines have exact times. Every other packet carries the time of the most
recent fast sample before it.

## 6. Flashing the blackbox firmware

Only needed after a firmware change. Requires `arm-none-eabi-gcc`, CMake, Ninja and a debug
probe.

```bash
cd blackbox-firmware
cmake --preset Release
cmake --build --preset Release
probe-rs download --chip STM32C011F6Px build/Release/blackbox-firmware.elf
```

Developer notes are in `blackbox-firmware/README.md` and `blackbox-firmware/DEV.md`.
