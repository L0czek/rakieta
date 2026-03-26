# Button Separator + Battery Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add experiment separator via PA1 button press and battery voltage monitoring via ADC, with distinct LED error patterns.

**Architecture:** Button debounce in 1ms tick sets a flag; `blackbox_process` triggers a flush (reusing idle-timeout path) and injects a separator byte after the real data. Battery ADC is polled once per second from the main loop. Error LED uses bit flags for distinct blink patterns (slow=SD, fast=battery).

**Tech Stack:** STM32 HAL (GPIO, ADC), existing blackbox module, bare-metal C.

---

### Task 1: Add separator and battery fields to blackbox.h

**Files:**
- Modify: `Core/Inc/blackbox.h`

**Step 1: Add configurable defaults and error flag constants**

Add after existing `#define BLACKBOX_TIMEOUT_MS`:

```c
#define BLACKBOX_SEPARATOR_BYTE 0xAA
#define BATTERY_LOW_ADC         2048
#define BATTERY_CHECK_MS        1000

#define BLACKBOX_ERR_SD         (1 << 0)
#define BLACKBOX_ERR_BATTERY    (1 << 1)
```

**Step 2: Add new fields to Blackbox struct**

Add after the `uint8_t error` field:

```c
    volatile uint8_t separator_pending;
    uint8_t separator_byte;
```

**Step 3: Build to verify no errors**

Run: `cmake --build build-release --target blackbox-firmware 2>&1 | tail -4`
Expected: links OK, no errors

**Step 4: Commit**

```
feat: add separator and battery constants to blackbox.h
```

---

### Task 2: Implement separator injection in blackbox.c

**Files:**
- Modify: `Core/Src/blackbox.c`

**Step 1: Initialize new fields in blackbox_init**

After `bb->error = 0;` add:

```c
    bb->separator_pending = 0;
    bb->separator_byte = BLACKBOX_SEPARATOR_BYTE;
```

**Step 2: Replace all bare `bb->error = 1` with `bb->error |= BLACKBOX_ERR_SD`**

There are 3 occurrences (2 in blackbox_process, 1 in flush_partial). Change each:

```c
// old:
    bb->error = 1;
// new:
    bb->error |= BLACKBOX_ERR_SD;
```

**Step 3: Modify flush_partial to accept a separator byte parameter**

Change `flush_partial` to inject the separator byte after the last real data byte when the byte is non-zero. The function already stops DMA, calculates position, zero-pads, and writes. Insert the separator at `dma_buf[pos]` (one byte after real data) before zero-padding:

```c
static void flush_partial(Blackbox *bb, uint8_t sep)
{
    DMA_HandleTypeDef *hdma = bb->huart->hdmarx;
    uint16_t ndtr = (uint16_t)__HAL_DMA_GET_COUNTER(hdma);
    uint16_t pos = BLACKBOX_DMA_BUF_SIZE - ndtr;

    HAL_UART_DMAStop(bb->huart);

    uint16_t half_idx = pos / BLACKBOX_HALF_SIZE;
    uint16_t offset = half_idx * BLACKBOX_HALF_SIZE;
    uint16_t used = pos - offset;

    if (used > 0 || sep != 0) {
        if (sep != 0 && used < BLACKBOX_HALF_SIZE) {
            bb->dma_buf[pos] = sep;
            used++;
        }
        memset(&bb->dma_buf[offset + used], 0,
               BLACKBOX_HALF_SIZE - used);
        if (SD_disk_write(bb->sd, &bb->dma_buf[offset],
                          bb->next_sector++, 1) != RES_OK)
            bb->error |= BLACKBOX_ERR_SD;
    }

    bb->write_pending[0] = 0;
    bb->write_pending[1] = 0;
    bb->flush_pending = 0;
    bb->separator_pending = 0;
    bb->last_ndtr = BLACKBOX_DMA_BUF_SIZE;
    bb->idle_ticks = 0;

    HAL_UART_Receive_DMA(bb->huart, bb->dma_buf,
                         BLACKBOX_DMA_BUF_SIZE);
}
```

**Step 4: Update blackbox_process to handle separator_pending**

Add separator handling after the `flush_pending` check:

```c
void blackbox_process(Blackbox *bb)
{
    if (bb->write_pending[0]) {
        if (SD_disk_write(bb->sd, &bb->dma_buf[0],
                          bb->next_sector++, 1) != RES_OK)
            bb->error |= BLACKBOX_ERR_SD;
        bb->write_pending[0] = 0;
    }

    if (bb->write_pending[1]) {
        if (SD_disk_write(bb->sd, &bb->dma_buf[BLACKBOX_HALF_SIZE],
                          bb->next_sector++, 1) != RES_OK)
            bb->error |= BLACKBOX_ERR_SD;
        bb->write_pending[1] = 0;
    }

    if (bb->flush_pending) {
        flush_partial(bb, 0);
    } else if (bb->separator_pending) {
        flush_partial(bb, bb->separator_byte);
    }
}
```

**Step 5: Build to verify**

Run: `cmake --build build-release --target blackbox-firmware 2>&1 | tail -4`
Expected: links OK

**Step 6: Commit**

```
feat: implement experiment separator injection in blackbox
```

---

### Task 3: Add button debounce and battery read in main.c

**Files:**
- Modify: `Core/Src/main.c`

**Step 1: Add defines and variables**

In the PD section, add:

```c
#define BTN_PIN          GPIO_PIN_1
#define BTN_PORT         GPIOA
#define BTN_DEBOUNCE_MS  20
#define BATTERY_ADC_CH   ADC_CHANNEL_11
```

In the PV section, add:

```c
volatile uint8_t btn_debounce;
volatile uint8_t btn_last;
uint32_t battery_check_tick;
```

**Step 2: Enable internal pull-up on PA1**

In `MX_GPIO_Init`, change the PA1/PA8 config to split PA1 out with pull-up:

```c
  /*Configure GPIO pin : PA1 (user button, active-low) */
  GPIO_InitStruct.Pin = GPIO_PIN_1;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pin : PA8 */
  GPIO_InitStruct.Pin = GPIO_PIN_8;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
```

**Step 3: Add button debounce in the TIM1 tick callback**

In the Callback 1 section, after the `blackbox_tick` call and before the activity LED handling, add:

```c
    {
      uint8_t pressed = (HAL_GPIO_ReadPin(BTN_PORT, BTN_PIN)
                         == GPIO_PIN_RESET);
      if (pressed && !btn_last) {
        btn_debounce++;
        if (btn_debounce >= BTN_DEBOUNCE_MS) {
          logger.separator_pending = 1;
          btn_debounce = 0;
          btn_last = 1;
        }
      } else if (!pressed) {
        btn_debounce = 0;
        btn_last = 0;
      }
    }
```

**Step 4: Add battery ADC read in main loop**

In the main loop, after `blackbox_process`, add:

```c
    if (HAL_GetTick() - battery_check_tick >= BATTERY_CHECK_MS) {
      battery_check_tick = HAL_GetTick();
      HAL_ADC_Start(&hadc1);
      if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
        uint32_t adc_val = HAL_ADC_GetValue(&hadc1);
        if (adc_val < BATTERY_LOW_ADC)
          logger.error |= BLACKBOX_ERR_BATTERY;
        else
          logger.error &= ~BLACKBOX_ERR_BATTERY;
      }
      HAL_ADC_Stop(&hadc1);
    }
```

**Step 5: Add ADC calibration before main loop**

In USER CODE BEGIN 2, after `MX_CRC_Init()` call and before the SD init, add:

```c
  HAL_ADCEx_Calibration_Start(&hadc1);
```

**Step 6: Build to verify**

Run: `cmake --build build-release --target blackbox-firmware 2>&1 | tail -4`
Expected: links OK

**Step 7: Commit**

```
feat: add button debounce and battery ADC polling
```

---

### Task 4: Update error LED patterns and logging

**Files:**
- Modify: `Core/Src/main.c`

**Step 1: Replace the error LED blink logic in the TIM1 tick**

Replace the current `if (logger.error)` block with distinct patterns:

```c
    if (logger.error & BLACKBOX_ERR_BATTERY) {
      /* Fast ~4Hz blink for battery low */
      if ((HAL_GetTick() & 0x7F) < 64)
        HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN,
                          GPIO_PIN_SET);
      else
        HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN,
                          GPIO_PIN_RESET);
    } else if (logger.error & BLACKBOX_ERR_SD) {
      /* Slow ~1Hz blink for SD error */
      if ((HAL_GetTick() & 0x1FF) < 256)
        HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN,
                          GPIO_PIN_SET);
      else
        HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN,
                          GPIO_PIN_RESET);
    }
```

**Step 2: Replace `logger.error = 1` in the SD init check**

In USER CODE BEGIN 2:

```c
// old:
    logger.error = 1;
// new:
    logger.error |= BLACKBOX_ERR_SD;
```

**Step 3: Add log messages for button press and battery**

After the battery check in the main loop, log on transition:

```c
        if (adc_val < BATTERY_LOW_ADC)
          logger.error |= BLACKBOX_ERR_BATTERY;
        else
          logger.error &= ~BLACKBOX_ERR_BATTERY;
```

In USER CODE BEGIN 2, add a startup battery check + log after ADC calibration:

```c
  HAL_ADC_Start(&hadc1);
  if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
    uint32_t adc_val = HAL_ADC_GetValue(&hadc1);
    LogInfoU32("Battery ADC: ", adc_val);
    if (adc_val < BATTERY_LOW_ADC) {
      logger.error |= BLACKBOX_ERR_BATTERY;
      LogError("Battery low!\n");
    }
  }
  HAL_ADC_Stop(&hadc1);
```

**Step 4: Build both targets and verify flash/RAM fit**

Run: `cmake --build build-release 2>&1 | grep 'Memory\|FLASH\|RAM'`
Expected: both targets link, FLASH < 16KB, RAM < 6KB

**Step 5: Commit**

```
feat: distinct LED blink patterns for SD and battery errors
```
