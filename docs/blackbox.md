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

1. **Every start appends a new session.** Powering the blackbox up, or pulling the card out
   and pushing it back in, starts a new session after the data already on the card. Earlier
   sessions stay intact. To find the end of the data, the blackbox looks for the first empty
   (all-zero) sector, so this only works on a card that was zeroed before its first use
   (section 3).

   **Firmware older than this change starts every session at sector 0 and overwrites the
   previous one.** A blackbox that has not been reflashed since (section 6) still does this:
   with it, take the card out after an experiment before powering the blackbox again. Check
   which behaviour your board has with the two-session test in section 4.
2. **The card is used raw, without a filesystem.** A computer shows it as unformatted. Do not
   let the operating system "fix" or format it. Read it with the decoder (section 5).
3. **The card must start out zeroed.** On a card that holds anything else (a filesystem, an
   old recording that was not written back to back), the search for the first empty sector
   lands in an arbitrary place. Zero a new card once, and zero it again whenever you want to
   start with an empty card.
4. **The last 2 KiB may be missing.** Data is written in 2 KiB blocks, and a partly filled
   block is not flushed when the stream stops. At 8 kB/s that is at most the last quarter
   second before the controller stopped sending.
5. **An overrun loses data but recording continues.** If the card is too slow, the blackbox
   raises the overrun error (8 blinks, section 4), drops about 2 KiB of the stream, and keeps
   recording. The error keeps blinking so that the loss is visible afterwards. Pulling the
   card out while data is arriving is not counted as an overrun: it shows the card error (1
   blink) alone, or 9 blinks if an overrun had already happened before.
6. **The button does nothing.**

## 3. Preparing the card

The blackbox decides where to write by looking for the first all-zero sector, so the card has
to be zero everywhere except where the blackbox itself has written. There are two ways to
zero it, and which one is correct depends on the card's history.

Build the tool once, as your user. Only the built binary runs with `sudo`, which it needs to
write to the card:

```bash
cd esp32-mainboard/tools/blackbox-decoder
cargo build --release
lsblk                       # find the card, for example /dev/sdX; check the size
```

**Full zeroing** — for a new card, a card that was used for anything else, or a card of
unknown history:

```bash
sudo target/*/release/blackbox-decoder format /dev/sdX
```

This writes zeros over the whole card. It takes a few minutes for a card of a few gigabytes
and proportionally longer for a larger one; a small card is enough, since an hour of recording
is about 30 MB.

**Quick zeroing** — only for a card that was fully zeroed once and has been written by
nothing but the blackbox since:

```bash
sudo target/*/release/blackbox-decoder format --quick /dev/sdX
```

This zeros from the start of the card and stops at the first 1 MiB block that is already
zero. Blackbox recordings are one unbroken run from the start of the card, so this removes
all of them in seconds. On a card with other content it stops at the first gap and leaves
everything behind the gap in place, and the blackbox will then start somewhere in the middle
of the card.

Both forms ask for confirmation first and **destroy whatever device you name.** Check the
device with `lsblk` every time, and copy the previous experiment off the card first
(section 5).

When to zero:

- once, fully, before a card's first use in the blackbox;
- quickly, before each experiment, so that the card holds that experiment only. This is
  optional with firmware that appends, but it keeps the decoded output short and
  unambiguous.

To check that a card is completely zero:

```bash
sudo cmp /dev/sdX /dev/zero
```

`cmp: EOF on /dev/sdX` means every byte is zero. A line starting with `/dev/sdX /dev/zero
differ` means it is not.

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
| 8 | UART overrun; some data was lost, recording continues |

For example 3 blinks = card problem + low battery.

Taking the card out and putting it back clears the card codes (1 and 4) and the overrun
code (8); 1 and 4 come back if they still apply to the card now in the socket. The low
battery code follows the battery: it is checked every second and is not affected by the
card.

**Activity LED** — blinks once per second while UART data is arriving, and goes dark about
one second after the data stops. It is dark after power-up until the first byte arrives.

1. Insert a zeroed card and power the blackbox. Both LEDs off.
2. Power the controller. The activity LED starts blinking.
3. Power the controller off or unplug the blackbox data line. The activity LED goes dark
   within about a second.

The activity LED shows that bytes arrive, not that they are written. With an error on the
status LED (missing card, failing card) it can blink while nothing is recorded, so always read
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
5. Put the card back, power the blackbox and the controller for another minute, and decode
   again. With current firmware the output now holds both sessions: the first one unchanged,
   then a second `experiment_separator` and the new
   data. If only the second session is there, the board runs the old firmware that overwrites
   from sector 0.
6. Zero the card again before the real run.

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

- The first line is `experiment_separator`. Each later session on the same card starts with
  another one, also where the previous session ended in the middle of a packet (that packet
  gives one `truncated packet … resynchronizing` warning).
- One `skipped … bytes between session start and the first timing sync` warning right after
  it: the recording starts in the middle of the stream, and the decoder drops everything up
  to the first timing sync instead of guessing at it.
- One `truncated packet … resynchronizing` near the end, where the stream stops.
- Timestamps that jump backwards mean a new session, or a controller reboot during a session.

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
