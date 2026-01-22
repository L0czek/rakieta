Blackbox firmware
=================

Purpose

Firmware for the `blackbox` data logger board. Responsible for receiving UART data and saving it to an SD card.

Building
--------

### Prerequisites

- ARM GCC toolchain (`arm-none-eabi-gcc`)
- CMake 3.22+
- Make or Ninja
- probe-rs (for flashing and debugging)

### Main Firmware

```bash
# Configure
cmake -B build/release -G "Unix Makefiles" \
    -DCMAKE_TOOLCHAIN_FILE=cmake/gcc-arm-none-eabi.cmake \
    -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build build/release
```

Output: `build/release/blackbox-firmware.elf`

### Test Target (SD Card Library)

The test target uses semihosting for `printf` output via the debugger.

```bash
# Configure
cmake -B build/test -G "Unix Makefiles" \
    -DCMAKE_TOOLCHAIN_FILE=cmake/gcc-arm-none-eabi.cmake \
    -DCMAKE_BUILD_TYPE=Debug

# Build
cmake --build build/test --target sdcard-test
```

Output: `build/test/sdcard-test.elf`

Flashing and Running
--------------------

### Flash Main Firmware

```bash
st-flash write build/release/blackbox-firmware.bin 0x08000000
```

### Flash and Run Tests (with Semihosting)

```bash
probe-rs run --chip STM32C011F6Px build/test/sdcard-test.elf
```

This will flash the test firmware and display semihosting output (printf) in the terminal.

### Alternative: Flash Only

```bash
# Convert to binary
arm-none-eabi-objcopy -O binary build/test/sdcard-test.elf build/test/sdcard-test.bin

# Flash
st-flash write build/test/sdcard-test.bin 0x08000000
```

Project Structure
-----------------

```text
blackbox-firmware/
├── Core/                    # STM32CubeMX generated code
├── Drivers/                 # STM32 HAL drivers
├── lib/
│   └── stm32-spi-dma-sdcard/  # SD card library
├── tests/
│   └── sdcard/              # SD card library tests
├── cmake/                   # CMake toolchain files
└── CMakeLists.txt
```
