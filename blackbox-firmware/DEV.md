# Development Notes

## Overview

This repository contains firmware for a raw UART-to-SD logger built on an
STM32C011. The main application receives a high-speed UART stream with DMA,
stores completed DMA half-buffers to an SD card over SPI, and reports state via
two GPIO-driven LEDs.

The codebase is a mix of STM32CubeMX-generated startup/peripheral code and a
small amount of handwritten application logic.

## Repository Structure

| Path | Responsibility |
| --- | --- |
| `Core/Src/main.c` | System init, peripheral setup, runtime loop, HAL callbacks, LED logic |
| `Core/Src/blackbox.c` | Logger state machine, UART DMA tracking, sector writes |
| `Core/Inc/blackbox.h` | Logger configuration, buffer sizes, error bit definitions |
| `Core/Src/stm32c0xx_it.c` | IRQ handlers, including `SysTick` forwarding to the SD driver |
| `Core/Src/stm32c0xx_hal_msp.c` | Low-level GPIO, DMA, SPI, ADC, and UART pin/peripheral wiring |
| `Core/Src/logging.c` | Currently unused stub |
| `cmake/stm32cubemx/CMakeLists.txt` | Generated source list and HAL driver wiring |
| `lib/stm32-spi-dma-sdcard/` | External SPI SD-card driver dependency used by the app |
| `tests/sdcard/test_main.c` | On-target SD driver test entrypoint |
| `tests/sdcard/test_it.c` | Minimal interrupt handlers for the SD driver test target |
| `test.sh` | Convenience wrapper to build and run `sdcard-test` with `probe-rs` |

## Build And Test Flow

### Main firmware

```bash
cmake --preset Release
cmake --build --preset Release
```

### SD driver test target

```bash
cmake --preset Debug
cmake --build --preset Debug --target sdcard-test
probe-rs run --chip STM32C011F6Px build/Debug/sdcard-test.elf
```

Notes:

- `CMakePresets.json` defines `Debug` and `Release` presets using the
  `cmake/gcc-arm-none-eabi.cmake` toolchain file.
- The GCC toolchain file sets the executable suffix to `.elf`.
- The test target is on-device firmware, not a host-side unit test binary.
- The test code uses semihosting BKPT calls for output and drives `PA0` high on
  success, low on failure.
- `test.sh` still targets the older `build/test` directory layout rather than
  the preset-based `build/Debug` tree.

## Peripheral Map

| Peripheral | Configuration | Used for |
| --- | --- | --- |
| `USART1` | 3,000,000 baud, 8N1, half-duplex single-wire, RX only | Capture input on `PA0` |
| `DMA1 Ch3` | Circular RX DMA | Fills the 4 KiB UART buffer |
| `SPI1` | Mode 0, 8-bit, prescaler `/4` | SD-card transfers on `PA5/PA6/PA7` |
| `DMA1 Ch1/Ch2` | SPI TX/RX DMA | Bulk SD-card data movement |
| `TIM14` | Prescaler `47`, period `999` | 1 kHz periodic task scheduler |
| `ADC1` | Channel 11 on `PA11` | Battery threshold check at startup |
| `GPIOA PA2` | Push-pull output | Status LED |
| `GPIOA PA3` | Push-pull output | Activity LED |
| `GPIOA PA8` | Input with pull-up, active low | SD card detect |
| `GPIOA PA1` | Input with pull-up, active low | Button input |

At 48 MHz system clock, the configured SPI prescaler yields a 12 Mbit/s SPI
clock, and TIM14 generates the 1 ms periodic tick used by the application
state machine.

`PA0` is configured in the HAL MSP layer as alternate-function open-drain with
an internal pull-up for the single-wire UART link.

## Runtime Architecture

### Boot sequence

`main()` performs the following steps:

1. Initializes HAL and the 48 MHz HSI-based system clock.
2. Configures GPIO, DMA, ADC, SPI, USART1, and TIM14.
3. Initializes the SD driver context with `SD_init(...)`.
4. Calls `sd_start_logging()` to initialize the card and start UART RX DMA.
5. Samples the battery ADC once and sets `BLACKBOX_ERR_BATTERY` if the value is
   below the configured threshold.
6. Starts TIM14 interrupts, which drive the periodic background work.

### Data path

The logger pipeline is:

1. `HAL_UART_Receive_DMA()` starts a circular DMA transfer into
   `blackbox.dma_buf` (`4096` bytes).
2. DMA half-complete and complete callbacks in `main.c` mark which 2 KiB half
   should be written next.
3. The main loop calls `blackbox_process(...)` whenever an SD card is present.
4. `blackbox_write_buffer(...)` writes the selected 2 KiB half-buffer as four
   512-byte sectors.

The firmware writes raw block data only. There is no filesystem layer in the
application code.

### Timing model

Two periodic mechanisms matter:

- `SysTick_Handler()` increments the HAL tick and forwards `SD_timer_tick(...)`
  into the SD driver.
- `TIM14_IRQHandler()` runs `periodic_task_handler()` at 1 kHz.

`periodic_task_handler()` is responsible for:

- updating blackbox idle detection via `blackbox_tick(...)`
- driving the activity LED state
- driving the status LED blink sequencer
- debouncing the button input

### SD-card insertion handling

The main loop polls the active-low card-detect pin:

- card removal stops UART DMA and latches `BLACKBOX_ERR_SD`
- card reinsertion retries initialization every 2 seconds

Reinitialization recreates the `Blackbox` state with `blackbox_init(...)`, which
clears the previous error bitmask before the new startup attempt proceeds.

## Error Model

`blackbox.error` is a bitmask defined in `Core/Inc/blackbox.h`:

| Bit value | Symbol | Meaning |
| --- | --- | --- |
| `1` | `BLACKBOX_ERR_SD` | SD init/read/write/card-detect failure |
| `2` | `BLACKBOX_ERR_BATTERY` | Startup battery below threshold |
| `4` | `BLACKBOX_ERR_FULL` | Next write would exceed card capacity |
| `8` | `BLACKBOX_ERR_OVERRUN` | UART DMA filled a half-buffer while an SD write was still running |

The status LED does not display each bit separately. It blinks the summed
numeric bitmask value.

## Important Implementation Details

These are the most relevant non-obvious behaviors in the checked-in firmware:

- `sd_start_logging()` calls `blackbox_find_free_sector(...)` and then
  immediately overrides the result with `free = 0;`. In practice, every new
  logging session starts again at sector `0`.
- Sector `0` is seeded with one `0xAA` marker byte and zeros. Payload logging
  starts at sector `1`.
- `BLACKBOX_DMA_BUF_SIZE` is `4096` bytes and each SD write is `2048` bytes.
- The idle timeout is `1000` ms, but `flush_pending` is not implemented, so a
  partially filled tail buffer is not written when the UART stream stops.
- Idle detection only advances when the DMA transfer counter is stable and not
  equal to the full buffer size. If traffic stops exactly on a 4 KiB DMA wrap
  boundary, `is_active` can remain set and the activity LED can keep blinking.
- The button debounce path sets `push_separator = 1`, but the separator write
  logic in `blackbox_process(...)` is commented out. There is no active user
  separator feature.
- The main loop busy-waits forever when `BLACKBOX_ERR_OVERRUN` is set. Timer and
  interrupt-driven LED updates can continue, but the foreground write loop is
  effectively halted until reset.
- The periodic battery re-check block exists only as commented code in
  `main.c`; the active implementation checks battery once at startup.
- `Core/Src/logging.c` and `Core/Inc/logging.h` are currently placeholders.

## Dependency Note

The build expects the external SD driver to exist under
`lib/stm32-spi-dma-sdcard/`. If that directory is empty in a checkout, the
firmware will not build until the dependency is populated.
