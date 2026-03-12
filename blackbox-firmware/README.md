# Blackbox Firmware

Firmware for an STM32C011-based data logger that captures a raw UART stream and
writes it directly to an SD card over SPI.

## Expected Use

This firmware is meant for a board that sits between a UART data source and a
removable SD card:

1. Insert an SD card.
2. Power the logger.
3. Feed the source stream into the logger UART input.
4. Remove the card later and inspect the raw binary capture offline.

The logger is designed for continuous binary capture. It does not create files,
mount a filesystem, or add metadata beyond a single marker sector at the start
of a session.

## What The Firmware Does

- Receives UART data with DMA into a 4 KiB RAM buffer.
- Writes each completed 2 KiB half-buffer to the SD card as raw sectors.
- Detects SD-card removal and retries initialization every 2 seconds after the
  card is reinserted.
- Samples the battery input once at startup and sets a low-battery error if it
  is below the configured threshold.
- Exposes two LEDs:
  - `PA2`: status / error code LED
  - `PA3`: activity LED

## Hardware Interface

| Signal | MCU pin | Notes |
| --- | --- | --- |
| UART input | `PA0` | USART1, half-duplex single-wire mode, receive only |
| Status LED | `PA2` | Error indicator |
| Activity LED | `PA3` | Capture/activity indicator |
| SD chip select | `PA4` | SPI CS |
| SD SPI clock | `PA5` | SPI1 SCK |
| SD SPI MISO | `PA6` | SPI1 MISO |
| SD SPI MOSI | `PA7` | SPI1 MOSI |
| SD card detect | `PA8` | Active low, input with pull-up |
| Battery sense | `PA11` | ADC1 channel 11 |
| Button input | `PA1` | Sampled and debounced, but has no user-visible effect yet |

## UART Parameters

The capture UART is configured as:

- `3000000` baud
- `8` data bits
- `1` stop bit
- `no parity`
- `no flow control`
- half-duplex single-wire mode on `PA0`
- `PA0` is configured as an alternate-function open-drain pin with pull-up
- receive only

If the sender does not match these settings, the captured data will be garbage.

## LED Behavior

### Activity LED (`PA3`)

The activity LED is a coarse capture-state indicator:

- It toggles every 500 ms while the firmware considers the logger active.
- It starts in the blinking state immediately after boot because the logger is
  initialized as active before any UART idle timeout can occur.
- It turns off after roughly 1 second with no further UART DMA progress once a
  partially filled buffer stops changing.
- If the stream stops exactly on a full 4 KiB DMA boundary, the current code
  can keep the LED blinking because idle detection does not trigger in that
  case.
- It is not a per-packet or per-sector write pulse.

Practical interpretation:

- Blinking: the logger is active or has not yet timed out of an active session.
- Off: the current session has gone idle.

### Status LED (`PA2`)

The status LED is normally off. When one or more error flags are set, it blinks
an error code until the bitmask is cleared or the device is reset:

- 500 ms on, 500 ms off for each blink
- 3 second pause after the full blink group
- blink count equals the numeric value of the current `blackbox.error` bitmask

Error flag weights:

| Blink value contribution | Meaning |
| --- | --- |
| `1` | SD error or SD card missing/removal |
| `2` | Battery below threshold at startup |
| `4` | Card full |
| `8` | UART overrun while an SD write is still in progress |

How to interpret combined errors:

- `1` blink: SD problem only
- `2` blinks: low battery only
- `3` blinks: SD problem + low battery (`1 + 2`)
- `4` blinks: card full only
- `5` blinks: SD problem + card full (`1 + 4`)
- `8` blinks: UART overrun only
- `9` blinks: UART overrun + SD problem (`8 + 1`)

The firmware uses the summed bitmask value, not separate blink groups per flag.
On a successful SD reinitialization, `blackbox_init()` clears the error bitmask
before logging restarts.

## Storage Format

The SD card contents are raw sectors, not files:

- Sector `0` is written with a marker byte `0xAA` followed by zeros.
- Logged payload data starts at sector `1`.
- Each completed 2 KiB UART DMA half-buffer is written as 4 consecutive
  512-byte sectors.

## Current Limitations

These are current behaviors of the checked-in firmware, not future plans:

- Every successful SD initialization restarts logging at sector `0`, so a new
  session overwrites the start of any previous capture on the card.
- Only completed 2 KiB half-buffers are written. The trailing partial buffer is
  not flushed when the UART stream stops.
- The push-button input is debounced in software, but the separator-write path
  is currently disabled.
- Battery is checked once at startup against a `3.3 V` threshold. The periodic
  battery re-check logic is present in comments but not active.
- If the UART stream stops exactly on a 4 KiB DMA wrap boundary, the current
  idle-detection logic may never mark the logger inactive.

## Build

### Prerequisites

- `arm-none-eabi-gcc`
- CMake `3.22+`
- Ninja
- `probe-rs` or another STM32 flashing tool
- A populated `lib/stm32-spi-dma-sdcard/` dependency

### Main Firmware

```bash
cmake --preset Release
cmake --build --preset Release
```

Output:

- `build/Release/blackbox-firmware.elf`

### SD Driver Test Firmware

```bash
cmake --preset Debug
cmake --build --preset Debug --target sdcard-test
```

Output:

- `build/Debug/sdcard-test.elf`

## Flashing

### Main Firmware

```bash
probe-rs download --chip STM32C011F6Px build/Release/blackbox-firmware.elf
```

### SD Driver Tests

```bash
probe-rs run --chip STM32C011F6Px build/Debug/sdcard-test.elf
```

The SD test firmware prints semihosting output and drives `PA0` high when all
tests pass.

## Repository Layout

```text
blackbox-firmware/
├── Core/                    STM32CubeMX-generated app code plus blackbox logic
├── Drivers/                 STM32 HAL and CMSIS sources
├── lib/                     External SD-card driver dependency
├── tests/                   On-target SD driver tests
├── cmake/                   Toolchain and STM32CubeMX CMake glue
├── README.md                Operator-facing usage notes
└── DEV.md                   Developer-facing architecture notes
```
