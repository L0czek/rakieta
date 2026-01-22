#!/bin/sh
cmake --build build/test --target sdcard-test && probe-rs run --probe 0483:3748 --chip STM32C011F6Px build/test/sdcard-test.elf
