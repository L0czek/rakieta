# SD Card Driver DMA Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical DMA bugs in the SD card SPI driver by switching single-byte transfers to polling and adding proper timeout-based DMA waiting for bulk transfers, with HAL_StatusTypeDef error propagation throughout.

**Architecture:** Dual-mode SPI layer — polling (`HAL_SPI_Transmit`/`HAL_SPI_TransmitReceive`) for all small transfers (commands, status, CRC, clock bytes), DMA with `SPI_WaitDMA` timeout loop for 512-byte sector data. Internal functions return `HAL_StatusTypeDef`; public disk API returns `DRESULT` (FatFS-compatible).

**Tech Stack:** STM32 HAL (STM32C0xx), C11, CMake + Ninja cross-compile (arm-none-eabi-gcc), on-target tests via probe-rs semihosting.

---

### Task 1: Update header with DMA timeout define

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/src/sd_functions.h:68`

**Step 1: Add the SD_DMA_TIMEOUT_MS define**

In `sd_functions.h`, after the existing `#define SPI_TIMEOUT 100` on line 68, add:

```c
#define SPI_TIMEOUT       100
#define SD_DMA_TIMEOUT_MS 50
```

No other header changes needed — the public API signatures stay identical.

**Step 2: Verify the build still compiles**

Run:
```bash
cmake --preset Debug && cmake --build build/Debug
```
Expected: clean build, zero errors.

**Step 3: Commit**

```bash
git add lib/stm32-spi-dma-sdcard/src/sd_functions.h
git commit -m "Add SD_DMA_TIMEOUT_MS define for DMA transfer timeout"
```

---

### Task 2: Rewrite SPI layer — polling functions + DMA with timeout

This is the core change. Replace the entire SPI functions section in `sd_functions.c`.

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/src/sd_functions.c:51-104`

**Step 1: Replace SPI functions section**

Delete lines 51–104 (the old `SPI_TxByte`, `SPI_TxBuffer`, `SPI_RxByte`, `SPI_RxBytePtr`) and replace with:

```c
/***************************************
 * SPI functions
 **************************************/

/* Slave select */
static void SELECT(SD_Context *ctx)
{
  HAL_GPIO_WritePin(ctx->cs_port, ctx->cs_pin, GPIO_PIN_RESET);
  HAL_Delay(1);
}

/* Slave deselect */
static void DESELECT(SD_Context *ctx)
{
  HAL_GPIO_WritePin(ctx->cs_port, ctx->cs_pin, GPIO_PIN_SET);
  HAL_Delay(1);
}

/* Wait for DMA completion with timeout */
static HAL_StatusTypeDef SPI_WaitDMA(SD_Context *ctx,
                                     uint32_t timeout_ms)
{
  uint32_t start = HAL_GetTick();
  while (!ctx->dma_complete) {
    if (timeout_ms != HAL_MAX_DELAY) {
      if ((HAL_GetTick() - start) >= timeout_ms) {
        HAL_SPI_Abort(ctx->spi_handle);
        return HAL_TIMEOUT;
      }
    }
  }
  return HAL_OK;
}

/* SPI transmit a byte (polling, blocking) */
static HAL_StatusTypeDef SPI_TxByte(SD_Context *ctx, uint8_t data)
{
  return HAL_SPI_Transmit(ctx->spi_handle, &data, 1, SPI_TIMEOUT);
}

/* SPI receive a byte (polling, blocking) */
static HAL_StatusTypeDef SPI_RxByte(SD_Context *ctx, uint8_t *out)
{
  uint8_t dummy = 0xFF;
  return HAL_SPI_TransmitReceive(ctx->spi_handle,
                                 &dummy, out, 1, SPI_TIMEOUT);
}

/* SPI transmit buffer via DMA with timeout wait */
static HAL_StatusTypeDef SPI_TxBuffer_DMA(SD_Context *ctx,
                                          uint8_t *buffer,
                                          uint16_t len,
                                          uint32_t timeout_ms)
{
  ctx->dma_complete = 0;
  HAL_StatusTypeDef hal_status =
      HAL_SPI_Transmit_DMA(ctx->spi_handle, buffer, len);
  if (hal_status != HAL_OK) return hal_status;
  return SPI_WaitDMA(ctx, timeout_ms);
}

/* SPI receive buffer via DMA with timeout wait */
static HAL_StatusTypeDef SPI_RxBuffer_DMA(SD_Context *ctx,
                                          uint8_t *buffer,
                                          uint16_t len,
                                          uint32_t timeout_ms)
{
  ctx->dma_complete = 0;
  HAL_StatusTypeDef hal_status =
      HAL_SPI_Receive_DMA(ctx->spi_handle, buffer, len);
  if (hal_status != HAL_OK) return hal_status;
  return SPI_WaitDMA(ctx, timeout_ms);
}
```

Key changes from old code:
- `SPI_TxByte`: was `void`, DMA with stack-local `&data` -> now returns `HAL_StatusTypeDef`, uses `HAL_SPI_Transmit` (polling).
- `SPI_RxByte`: was `uint8_t` return, DMA with stack-locals -> now returns `HAL_StatusTypeDef`, byte via `*out`, uses `HAL_SPI_TransmitReceive` (polling).
- `SPI_TxBuffer` renamed to `SPI_TxBuffer_DMA`: was `void`, no wait -> now returns `HAL_StatusTypeDef`, waits for DMA with timeout.
- `SPI_RxBuffer_DMA`: new function. Uses `HAL_SPI_Receive_DMA` + `SPI_WaitDMA`.
- `SPI_RxBytePtr`: deleted. Callers use `SPI_RxByte(ctx, &byte)` directly.

**Step 2: Verify build**

Run:
```bash
cmake --build build/Debug
```
Expected: build FAILS — callers of old signatures not yet updated. This is expected; we fix them in the next tasks.

**Step 3: Commit (WIP)**

```bash
git add lib/stm32-spi-dma-sdcard/src/sd_functions.c
git commit -m "WIP: rewrite SPI layer with polling + DMA timeout"
```

---

### Task 3: Update SD_ReadyWait and SD_PowerOn

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/src/sd_functions.c:110-160` (old line numbers; locate by function name)

**Step 1: Rewrite SD_ReadyWait**

Old signature: `static uint8_t SD_ReadyWait(SD_Context *ctx)`
New signature: `static HAL_StatusTypeDef SD_ReadyWait(SD_Context *ctx)`

```c
/* Wait SD ready */
static HAL_StatusTypeDef SD_ReadyWait(SD_Context *ctx)
{
  uint8_t res;
  HAL_StatusTypeDef status;

  ctx->timer2 = 500;

  do {
    status = SPI_RxByte(ctx, &res);
    if (status != HAL_OK) return status;
  } while ((res != 0xFF) && ctx->timer2);

  return (res == 0xFF) ? HAL_OK : HAL_TIMEOUT;
}
```

**Step 2: Rewrite SD_PowerOn**

Old signature: `static void SD_PowerOn(SD_Context *ctx)`
New signature: `static HAL_StatusTypeDef SD_PowerOn(SD_Context *ctx)`

```c
/* Power on */
static HAL_StatusTypeDef SD_PowerOn(SD_Context *ctx)
{
  uint8_t args[6];
  uint32_t cnt = 0x1FFF;
  HAL_StatusTypeDef status;
  uint8_t resp;

  DESELECT(ctx);
  for (int i = 0; i < 10; i++) {
    status = SPI_TxByte(ctx, 0xFF);
    if (status != HAL_OK) return status;
  }

  SELECT(ctx);

  args[0] = CMD0;
  args[1] = 0;
  args[2] = 0;
  args[3] = 0;
  args[4] = 0;
  args[5] = 0x95;

  for (uint8_t i = 0; i < sizeof(args); i++) {
    status = SPI_TxByte(ctx, args[i]);
    if (status != HAL_OK) return status;
  }

  do {
    status = SPI_RxByte(ctx, &resp);
    if (status != HAL_OK) return status;
  } while ((resp != 0x01) && cnt--);

  DESELECT(ctx);
  status = SPI_TxByte(ctx, 0xFF);
  if (status != HAL_OK) return status;

  ctx->power_flag = 1;
  return HAL_OK;
}
```

Note: The old `SD_PowerOn` used `SPI_TxBuffer` to send the 6-byte CMD0 frame. Since this is only 6 bytes (not 512), we now send byte-by-byte with polling per the design decision. The loop is simple and avoids DMA for small transfers.

**Step 3: Commit**

```bash
git add lib/stm32-spi-dma-sdcard/src/sd_functions.c
git commit -m "WIP: update SD_ReadyWait and SD_PowerOn with error propagation"
```

---

### Task 4: Update SD_SendCmd

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/src/sd_functions.c` (locate `SD_SendCmd` function)

**Step 1: Rewrite SD_SendCmd**

Old signature: `static BYTE SD_SendCmd(SD_Context *ctx, BYTE cmd, uint32_t arg)`
New signature: `static HAL_StatusTypeDef SD_SendCmd(SD_Context *ctx, BYTE cmd, uint32_t arg, BYTE *response)`

The command response byte is now returned via `*response` out-param.

```c
/* Transmit command, return response via out-param */
static HAL_StatusTypeDef SD_SendCmd(SD_Context *ctx,
                                    BYTE cmd,
                                    uint32_t arg,
                                    BYTE *response)
{
  uint8_t crc, res;
  HAL_StatusTypeDef status;

  status = SD_ReadyWait(ctx);
  if (status != HAL_OK) {
    *response = 0xFF;
    return status;
  }

  /* transmit command frame */
  uint8_t frame[6];
  frame[0] = cmd;
  frame[1] = (uint8_t)(arg >> 24);
  frame[2] = (uint8_t)(arg >> 16);
  frame[3] = (uint8_t)(arg >> 8);
  frame[4] = (uint8_t)arg;

  if (cmd == CMD0) crc = 0x95;
  else if (cmd == CMD8) crc = 0x87;
  else crc = 1;
  frame[5] = crc;

  for (uint8_t i = 0; i < 6; i++) {
    status = SPI_TxByte(ctx, frame[i]);
    if (status != HAL_OK) {
      *response = 0xFF;
      return status;
    }
  }

  /* Skip stuff byte for STOP_TRANSMISSION */
  if (cmd == CMD12) {
    status = SPI_RxByte(ctx, &res);
    if (status != HAL_OK) {
      *response = 0xFF;
      return status;
    }
  }

  /* receive response */
  uint8_t n = 10;
  do {
    status = SPI_RxByte(ctx, &res);
    if (status != HAL_OK) {
      *response = 0xFF;
      return status;
    }
  } while ((res & 0x80) && --n);

  *response = res;
  return HAL_OK;
}
```

**Step 2: Commit**

```bash
git add lib/stm32-spi-dma-sdcard/src/sd_functions.c
git commit -m "WIP: update SD_SendCmd with HAL_StatusTypeDef and out-param"
```

---

### Task 5: Update SD_RxDataBlock and SD_TxDataBlock

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/src/sd_functions.c` (locate `SD_RxDataBlock` and `SD_TxDataBlock`)

**Step 1: Rewrite SD_RxDataBlock**

Old: `static bool SD_RxDataBlock(SD_Context *ctx, BYTE *buff, UINT len)`
New: `static HAL_StatusTypeDef SD_RxDataBlock(SD_Context *ctx, BYTE *buff, UINT len)`

```c
/* Receive data block */
static HAL_StatusTypeDef SD_RxDataBlock(SD_Context *ctx,
                                        BYTE *buff, UINT len)
{
  uint8_t token;
  HAL_StatusTypeDef status;

  ctx->timer1 = 200;

  do {
    status = SPI_RxByte(ctx, &token);
    if (status != HAL_OK) return status;
  } while ((token == 0xFF) && ctx->timer1);

  if (token != 0xFE) return HAL_ERROR;

  /* Bulk receive via DMA */
  status = SPI_RxBuffer_DMA(ctx, buff, len, SD_DMA_TIMEOUT_MS);
  if (status != HAL_OK) return status;

  /* discard CRC (2 bytes) */
  uint8_t crc_byte;
  status = SPI_RxByte(ctx, &crc_byte);
  if (status != HAL_OK) return status;
  status = SPI_RxByte(ctx, &crc_byte);
  return status;
}
```

Key change: the old code received 512 bytes one-at-a-time via `SPI_RxBytePtr` in a loop. Now uses `SPI_RxBuffer_DMA` for the bulk data.

**Step 2: Rewrite SD_TxDataBlock**

Old: `static bool SD_TxDataBlock(SD_Context *ctx, const uint8_t *buff, BYTE token)`
New: `static HAL_StatusTypeDef SD_TxDataBlock(SD_Context *ctx, const uint8_t *buff, BYTE token)`

```c
/* Transmit data block */
static HAL_StatusTypeDef SD_TxDataBlock(SD_Context *ctx,
                                        const uint8_t *buff,
                                        BYTE token)
{
  uint8_t resp;
  HAL_StatusTypeDef status;

  status = SD_ReadyWait(ctx);
  if (status != HAL_OK) return status;

  status = SPI_TxByte(ctx, token);
  if (status != HAL_OK) return status;

  if (token == 0xFD) return HAL_OK;

  /* Bulk transmit via DMA */
  status = SPI_TxBuffer_DMA(ctx, (uint8_t *)buff, 512,
                            SD_DMA_TIMEOUT_MS);
  if (status != HAL_OK) return status;

  /* discard CRC */
  uint8_t dummy;
  status = SPI_RxByte(ctx, &dummy);
  if (status != HAL_OK) return status;
  status = SPI_RxByte(ctx, &dummy);
  if (status != HAL_OK) return status;

  /* receive data response */
  uint8_t i = 0;
  while (i <= 64) {
    status = SPI_RxByte(ctx, &resp);
    if (status != HAL_OK) return status;
    if ((resp & 0x1F) == 0x05) break;
    i++;
  }

  /* wait for card to finish programming */
  do {
    status = SPI_RxByte(ctx, &resp);
    if (status != HAL_OK) return status;
  } while (resp == 0x00);

  return ((resp & 0x1F) == 0x05) ? HAL_OK : HAL_ERROR;
}
```

Note: The old `while (SPI_RxByte(ctx) == 0);` (line 231) was an infinite loop with no timeout. We keep the same logic (wait for card to finish programming) but now with proper error returns from `SPI_RxByte`. A future improvement could add a timeout here, but that's out of scope for this refactor.

**Step 3: Commit**

```bash
git add lib/stm32-spi-dma-sdcard/src/sd_functions.c
git commit -m "WIP: update data block functions with DMA bulk + error propagation"
```

---

### Task 6: Update public disk functions (SD_disk_initialize, SD_disk_read, SD_disk_write, SD_disk_ioctl)

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/src/sd_functions.c` (public functions section, lines ~275–531)

**Step 1: Rewrite SD_disk_initialize**

The function must now handle `HAL_StatusTypeDef` returns from `SD_PowerOn` and `SD_SendCmd` (which now takes a `BYTE *response` out-param).

```c
/* Initialize SD card */
DSTATUS SD_disk_initialize(SD_Context *ctx)
{
  uint8_t n, type, ocr[4];
  BYTE resp;
  HAL_StatusTypeDef status;

  if (ctx->status & STA_NODISK) return ctx->status;

  status = SD_PowerOn(ctx);
  if (status != HAL_OK) {
    SD_PowerOff(ctx);
    return ctx->status;
  }

  SELECT(ctx);

  type = 0;

  if (SD_SendCmd(ctx, CMD0, 0, &resp) == HAL_OK && resp == 1) {
    ctx->timer1 = 1000;

    if (SD_SendCmd(ctx, CMD8, 0x1AA, &resp) == HAL_OK && resp == 1) {
      for (n = 0; n < 4; n++) {
        if (SPI_RxByte(ctx, &ocr[n]) != HAL_OK) goto fail;
      }

      if (ocr[2] == 0x01 && ocr[3] == 0xAA) {
        do {
          if (SD_SendCmd(ctx, CMD55, 0, &resp) != HAL_OK) goto fail;
          if (resp > 1) continue;
          if (SD_SendCmd(ctx, CMD41, 1UL << 30, &resp) != HAL_OK) goto fail;
          if (resp == 0) break;
        } while (ctx->timer1);

        if (ctx->timer1
            && SD_SendCmd(ctx, CMD58, 0, &resp) == HAL_OK
            && resp == 0) {
          for (n = 0; n < 4; n++) {
            if (SPI_RxByte(ctx, &ocr[n]) != HAL_OK) goto fail;
          }
          type = (ocr[0] & 0x40) ? CT_SD2 | CT_BLOCK : CT_SD2;
        }
      }
    } else {
      if (SD_SendCmd(ctx, CMD55, 0, &resp) == HAL_OK && resp <= 1
          && SD_SendCmd(ctx, CMD41, 0, &resp) == HAL_OK && resp <= 1) {
        type = CT_SD1;
      } else {
        type = CT_MMC;
      }

      do {
        if (type == CT_SD1) {
          if (SD_SendCmd(ctx, CMD55, 0, &resp) != HAL_OK) goto fail;
          if (SD_SendCmd(ctx, CMD41, 0, &resp) != HAL_OK) goto fail;
          if (resp == 0) break;
        } else {
          if (SD_SendCmd(ctx, CMD1, 0, &resp) != HAL_OK) goto fail;
          if (resp == 0) break;
        }
      } while (ctx->timer1);

      if (!ctx->timer1
          || SD_SendCmd(ctx, CMD16, 512, &resp) != HAL_OK
          || resp != 0) {
        type = 0;
      }
    }
  }

  goto done;

fail:
  type = 0;

done:
  ctx->card_type = type;

  DESELECT(ctx);
  SPI_RxByte(ctx, &resp);

  if (type) {
    ctx->status &= ~STA_NOINIT;
  } else {
    SD_PowerOff(ctx);
  }

  return ctx->status;
}
```

**Step 2: Rewrite SD_disk_read**

```c
/* Read sector */
DRESULT SD_disk_read(SD_Context *ctx, BYTE *buff,
                     DWORD sector, UINT count)
{
  BYTE resp;
  uint8_t dummy;

  if (!count) return RES_PARERR;
  if (ctx->status & STA_NOINIT) return RES_NOTRDY;

  if (!(ctx->card_type & CT_SD2)) sector *= 512;

  SELECT(ctx);

  if (count == 1) {
    if (SD_SendCmd(ctx, CMD17, sector, &resp) == HAL_OK
        && resp == 0
        && SD_RxDataBlock(ctx, buff, 512) == HAL_OK) {
      count = 0;
    }
  } else {
    if (SD_SendCmd(ctx, CMD18, sector, &resp) == HAL_OK
        && resp == 0) {
      do {
        if (SD_RxDataBlock(ctx, buff, 512) != HAL_OK) break;
        buff += 512;
      } while (--count);
      SD_SendCmd(ctx, CMD12, 0, &resp);
    }
  }

  DESELECT(ctx);
  SPI_RxByte(ctx, &dummy);

  return count ? RES_ERROR : RES_OK;
}
```

**Step 3: Rewrite SD_disk_write**

```c
/* Write sector */
DRESULT SD_disk_write(SD_Context *ctx, const BYTE *buff,
                      DWORD sector, UINT count)
{
  BYTE resp;
  uint8_t dummy;

  if (!count) return RES_PARERR;
  if (ctx->status & STA_NOINIT) return RES_NOTRDY;
  if (ctx->status & STA_PROTECT) return RES_WRPRT;

  if (!(ctx->card_type & CT_SD2)) sector *= 512;

  SELECT(ctx);

  if (count == 1) {
    if (SD_SendCmd(ctx, CMD24, sector, &resp) == HAL_OK
        && resp == 0
        && SD_TxDataBlock(ctx, buff, 0xFE) == HAL_OK) {
      count = 0;
    }
  } else {
    if (ctx->card_type & CT_SD1) {
      SD_SendCmd(ctx, CMD55, 0, &resp);
      SD_SendCmd(ctx, CMD23, count, &resp);
    }

    if (SD_SendCmd(ctx, CMD25, sector, &resp) == HAL_OK
        && resp == 0) {
      do {
        if (SD_TxDataBlock(ctx, buff, 0xFC) != HAL_OK) break;
        buff += 512;
      } while (--count);

      if (SD_TxDataBlock(ctx, 0, 0xFD) != HAL_OK) {
        count = 1;
      }
    }
  }

  DESELECT(ctx);
  SPI_RxByte(ctx, &dummy);

  return count ? RES_ERROR : RES_OK;
}
```

**Step 4: Rewrite SD_disk_ioctl**

```c
/* ioctl */
DRESULT SD_disk_ioctl(SD_Context *ctx, BYTE ctrl, void *buff)
{
  DRESULT res;
  BYTE resp;
  uint8_t n, csd[16], *ptr = buff;
  WORD csize;

  res = RES_ERROR;

  if (ctrl == CTRL_POWER) {
    switch (*ptr) {
    case 0:
      SD_PowerOff(ctx);
      res = RES_OK;
      break;
    case 1:
      if (SD_PowerOn(ctx) == HAL_OK) res = RES_OK;
      break;
    case 2:
      *(ptr + 1) = SD_CheckPower(ctx);
      res = RES_OK;
      break;
    default:
      res = RES_PARERR;
    }
  } else {
    if (ctx->status & STA_NOINIT) return RES_NOTRDY;

    SELECT(ctx);

    switch (ctrl) {
    case GET_SECTOR_COUNT:
      if (SD_SendCmd(ctx, CMD9, 0, &resp) == HAL_OK
          && resp == 0
          && SD_RxDataBlock(ctx, csd, 16) == HAL_OK) {
        if ((csd[0] >> 6) == 1) {
          csize = csd[9] + ((WORD)csd[8] << 8) + 1;
          *(DWORD *)buff = (DWORD)csize << 10;
        } else {
          n = (csd[5] & 15) + ((csd[10] & 128) >> 7)
              + ((csd[9] & 3) << 1) + 2;
          csize = (csd[8] >> 6) + ((WORD)csd[7] << 2)
                  + ((WORD)(csd[6] & 3) << 10) + 1;
          *(DWORD *)buff = (DWORD)csize << (n - 9);
        }
        res = RES_OK;
      }
      break;
    case GET_SECTOR_SIZE:
      *(WORD *)buff = 512;
      res = RES_OK;
      break;
    case CTRL_SYNC:
      if (SD_ReadyWait(ctx) == HAL_OK) res = RES_OK;
      break;
    case MMC_GET_CSD:
      if (SD_SendCmd(ctx, CMD9, 0, &resp) == HAL_OK
          && resp == 0
          && SD_RxDataBlock(ctx, ptr, 16) == HAL_OK) {
        res = RES_OK;
      }
      break;
    case MMC_GET_CID:
      if (SD_SendCmd(ctx, CMD10, 0, &resp) == HAL_OK
          && resp == 0
          && SD_RxDataBlock(ctx, ptr, 16) == HAL_OK) {
        res = RES_OK;
      }
      break;
    case MMC_GET_OCR:
      if (SD_SendCmd(ctx, CMD58, 0, &resp) == HAL_OK
          && resp == 0) {
        for (n = 0; n < 4; n++) {
          if (SPI_RxByte(ctx, ptr++) != HAL_OK) break;
        }
        if (n == 4) res = RES_OK;
      }
      break;
    default:
      res = RES_PARERR;
    }

    DESELECT(ctx);
    SPI_RxByte(ctx, &resp);
  }

  return res;
}
```

**Step 5: Verify build compiles**

Run:
```bash
cmake --build build/Debug 2>&1
```
Expected: clean build, zero errors, zero warnings.

**Step 6: Commit**

```bash
git add lib/stm32-spi-dma-sdcard/src/sd_functions.c
git commit -m "Complete SD driver DMA refactor with error propagation"
```

---

### Task 7: Remove old defines and clean up

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/src/sd_functions.c:1-7`

**Step 1: Remove the old TRUE/FALSE/bool defines**

The old code defined `TRUE`, `FALSE`, and a `bool` typedef (aliased to `BYTE`). These were used as return values for `SD_RxDataBlock` and `SD_TxDataBlock`, which now return `HAL_StatusTypeDef`. Remove:

```c
#define TRUE  1
#define FALSE 0
#define bool BYTE
```

**Step 2: Verify build**

```bash
cmake --build build/Debug 2>&1
```
Expected: clean, no warnings.

**Step 3: Commit**

```bash
git add lib/stm32-spi-dma-sdcard/src/sd_functions.c
git commit -m "Remove unused TRUE/FALSE/bool defines from SD driver"
```

---

### Task 8: Squash WIP commits and create final commit

**Step 1: Interactive rebase to squash**

Count how many WIP commits were made (should be ~5 commits from tasks 1-7). Squash them into a single clean commit:

```bash
git rebase -i HEAD~<number-of-commits>
```

Squash all into one commit with message:

```
Refactor SD card driver: polling for commands, DMA with timeout for bulk data

- Replace DMA single-byte SPI with polling HAL_SPI_Transmit/TransmitReceive
- Add SPI_WaitDMA with configurable timeout (50ms default)
- Add SPI_TxBuffer_DMA and SPI_RxBuffer_DMA for 512-byte sector transfers
- All internal functions return HAL_StatusTypeDef with proper error propagation
- Public API unchanged (DRESULT for FatFS compatibility)
- Fix UB: no more stack-local pointers passed to DMA
- Fix silent failures: all SPI errors detected and propagated
```

**Step 2: Verify final build**

```bash
cmake --preset Debug && cmake --build build/Debug 2>&1
```
Expected: clean build.

---

### Task 9: On-target test

**Step 1: Build the test target**

```bash
cmake --build build/Debug --target sdcard-test
```

**Step 2: Flash and run**

```bash
probe-rs run --probe 0483:3748 --chip STM32C011F6Px build/Debug/sdcard-test.elf
```

Expected: all tests pass (init, ioctl, read, write/verify). The test code in `tests/sdcard/test_main.c` does not need changes — it only uses the public API (`SD_init`, `SD_disk_initialize`, `SD_disk_read`, `SD_disk_write`, `SD_disk_ioctl`), which has unchanged signatures.

**Step 3: If tests fail, debug and fix**

Use semihosting output to identify which test failed. Common issues:
- DMA timeout too short: increase `SD_DMA_TIMEOUT_MS`
- SPI polling timeout: increase `SPI_TIMEOUT`
- DMA callback not firing: verify interrupt handler wiring in `test_it.c`

---

### Task 10: Update README and AGENTS.md

**Files:**
- Modify: `lib/stm32-spi-dma-sdcard/README.org`

**Step 1: Update README**

Update the "How it Works" section to reflect the new dual-mode architecture:

Replace the last section with:
```org
* How it Works
The library uses a dual-mode SPI approach:
- **Polling** (=HAL_SPI_Transmit= / =HAL_SPI_TransmitReceive=) for single-byte transfers: commands, status checks, CRC bytes, and clock pulses.
- **DMA** (=HAL_SPI_Transmit_DMA= / =HAL_SPI_Receive_DMA=) for 512-byte sector bulk reads and writes, with configurable timeout (=SD_DMA_TIMEOUT_MS=, default 50ms).

All internal functions return =HAL_StatusTypeDef= for proper error propagation. The public disk API returns =DRESULT= for FatFS compatibility. DMA transfers use =SPI_WaitDMA()= which polls the =dma_complete= flag with a =HAL_GetTick()=-based deadline, calling =HAL_SPI_Abort()= on timeout.
```

**Step 2: Commit**

```bash
git add lib/stm32-spi-dma-sdcard/README.org
git commit -m "Update SD driver README with dual-mode SPI architecture"
```
