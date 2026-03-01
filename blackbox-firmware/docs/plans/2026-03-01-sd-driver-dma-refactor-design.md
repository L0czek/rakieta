# SD Card Driver DMA Refactor Design

## Problem

The SD card SPI driver (`lib/stm32-spi-dma-sdcard`) has critical bugs in its DMA handling:

1. **Stack-local pointers passed to DMA:** `SPI_TxByte` and `SPI_RxByte` pass addresses of stack-local variables to DMA. DMA reads/writes these addresses after the function returns — undefined behavior.
2. **No DMA completion wait:** No function waits for `dma_complete` after starting a DMA transfer. Subsequent SPI operations race against in-flight DMA.
3. **Silent failures:** If `dma_complete == 0` (DMA busy), functions silently skip the transfer. `SPI_RxByte` always returns `0xFF` (the initial value) since DMA hasn't written the result yet.

## Solution: Dual-Mode SPI (Polling + DMA)

**Polling** for single-byte and small transfers (commands, status, CRC, clock pulses). **DMA** only for 512-byte sector bulk data, with HAL-style timeout waiting.

### SPI Layer

Polling functions (blocking, no DMA):

```c
static HAL_StatusTypeDef SPI_TxByte(SD_Context *ctx, uint8_t data);
static HAL_StatusTypeDef SPI_RxByte(SD_Context *ctx, uint8_t *out);
```

- Use `HAL_SPI_Transmit` / `HAL_SPI_TransmitReceive` with `SPI_TIMEOUT` (100ms).
- Safe: no stack-pointer issues, guaranteed completion before return.

DMA functions (for 512-byte sector data):

```c
static HAL_StatusTypeDef SPI_TxBuffer_DMA(
    SD_Context *ctx, uint8_t *buffer, uint16_t len,
    uint32_t timeout_ms);

static HAL_StatusTypeDef SPI_RxBuffer_DMA(
    SD_Context *ctx, uint8_t *buffer, uint16_t len,
    uint32_t timeout_ms);
```

- Start DMA transfer, then poll `ctx->dma_complete` with `HAL_GetTick()` deadline.
- On timeout: call `HAL_SPI_Abort()` to cleanly stop DMA, return `HAL_TIMEOUT`.
- On HAL DMA start failure: return `HAL_ERROR`.

### DMA Wait Implementation

```c
static HAL_StatusTypeDef SPI_WaitDMA(SD_Context *ctx, uint32_t timeout_ms)
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
```

Default timeout: `SD_DMA_TIMEOUT_MS = 50` (50ms — generous at slowest SPI clock of 187.5 kHz where 512 bytes takes ~22ms).

### Error Propagation

Internal functions return `HAL_StatusTypeDef`:

| Function | Current Return | New Return |
|----------|---------------|------------|
| `SPI_TxByte` | `void` | `HAL_StatusTypeDef` |
| `SPI_RxByte` | `uint8_t` | `HAL_StatusTypeDef` (byte via out-param) |
| `SPI_TxBuffer_DMA` | `void` | `HAL_StatusTypeDef` |
| `SPI_RxBuffer_DMA` | new | `HAL_StatusTypeDef` |
| `SD_SendCmd` | `BYTE` | `HAL_StatusTypeDef` (response via out-param) |
| `SD_ReadyWait` | `uint8_t` | `HAL_StatusTypeDef` |
| `SD_RxDataBlock` | `bool` | `HAL_StatusTypeDef` |
| `SD_TxDataBlock` | `bool` | `HAL_StatusTypeDef` |
| `SD_PowerOn` | `void` | `HAL_StatusTypeDef` |

Public functions translate to `DRESULT`:
- `HAL_OK` -> `RES_OK`
- `HAL_TIMEOUT` / `HAL_ERROR` / `HAL_BUSY` -> `RES_ERROR`

Public API signatures (`SD_disk_read`, `SD_disk_write`, etc.) remain unchanged. FatFS compatibility preserved.

### Callback Functions

No changes. `SD_spi_tx_complete`, `SD_spi_rx_complete`, `SD_spi_txrx_complete` still set `ctx->dma_complete = 1`.

### SD_Context Changes

No structural changes. `dma_complete` field already exists and is used by the DMA wait loop.

### Files Changed

- `lib/stm32-spi-dma-sdcard/src/sd_functions.c` — full rework of SPI layer and error propagation
- `lib/stm32-spi-dma-sdcard/src/sd_functions.h` — add `SD_DMA_TIMEOUT_MS` define, no public API signature changes

### Decisions

- Polling for all non-data transfers (commands, status, CRC, clock)
- DMA only for 512-byte sector bulk reads/writes
- Per-call `uint32_t timeout_ms` parameter on DMA functions (HAL convention)
- `HAL_StatusTypeDef` internally, `DRESULT` at public API boundary
- 50ms default DMA timeout
- `HAL_SPI_Abort()` on timeout for clean DMA teardown
