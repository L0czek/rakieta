#include "blackbox.h"
#include "logging.h"
#include <string.h>

void blackbox_init(Blackbox *bb, SD_Context *sd,
                   UART_HandleTypeDef *huart,
                   uint32_t start_sector,
                   uint32_t timeout_ms)
{
    memset(bb->dma_buf, 0, BLACKBOX_DMA_BUF_SIZE);
    bb->write_pending[0] = 0;
    bb->write_pending[1] = 0;
    bb->flush_pending = 0;
    bb->next_sector = start_sector;
    bb->total_sectors = 0;
    bb->timeout_ms = timeout_ms;
    bb->last_ndtr = BLACKBOX_DMA_BUF_SIZE;
    bb->idle_ticks = 0;
    bb->error = 0;
    bb->separator_pending = 0;
    bb->separator_byte = BLACKBOX_SEPARATOR_BYTE;
    bb->sd = sd;
    bb->huart = huart;
}

void blackbox_start(Blackbox *bb)
{
    HAL_UART_Receive_DMA(bb->huart, bb->dma_buf,
                         BLACKBOX_DMA_BUF_SIZE);
}

void blackbox_tick(Blackbox *bb)
{
    if (bb->huart == NULL)
        return;
    DMA_HandleTypeDef *hdma = bb->huart->hdmarx;
    uint16_t ndtr = (uint16_t)__HAL_DMA_GET_COUNTER(hdma);

    if (ndtr == bb->last_ndtr) {
        if (ndtr != BLACKBOX_DMA_BUF_SIZE) {
            bb->idle_ticks++;
            if (bb->idle_ticks >= bb->timeout_ms) {
                bb->flush_pending = 1;
                bb->idle_ticks = 0;
            }
        }
    } else {
        bb->idle_ticks = 0;
        bb->last_ndtr = ndtr;
    }
}

static void flush_partial(Blackbox *bb, uint8_t sep)
{
    HAL_UART_DMAStop(bb->huart);

    /* Clear pending UART RX DMA flags (Ch3 only) so a
       latched HT/TC from before the stop can't fire after
       we restart DMA and set stale write_pending flags. */
    DMA1->IFCR = DMA_IFCR_CGIF3 | DMA_IFCR_CTCIF3
               | DMA_IFCR_CHTIF3 | DMA_IFCR_CTEIF3;

    /* NDTR is stable now that channel 3 is stopped */
    DMA_HandleTypeDef *hdma = bb->huart->hdmarx;
    uint16_t ndtr = (uint16_t)__HAL_DMA_GET_COUNTER(hdma);
    uint16_t pos = BLACKBOX_DMA_BUF_SIZE - ndtr;

    uint16_t half_idx = pos / BLACKBOX_HALF_SIZE;
    uint16_t offset = half_idx * BLACKBOX_HALF_SIZE;
    uint16_t used = pos - offset;

    if (sep != 0 && used < BLACKBOX_HALF_SIZE) {
        bb->dma_buf[offset + used] = sep;
        used++;
    }

    if (used > 0) {
        memset(&bb->dma_buf[offset + used], 0,
               BLACKBOX_HALF_SIZE - used);
        if (bb->total_sectors > 0
            && bb->next_sector >= bb->total_sectors) {
            bb->error |= BLACKBOX_ERR_FULL;
        } else if (SD_disk_write(bb->sd, &bb->dma_buf[offset],
                          bb->next_sector++, 1) != RES_OK) {
            bb->error |= BLACKBOX_ERR_SD;
        }
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

uint32_t blackbox_find_free_sector(Blackbox *bb,
                                   GPIO_TypeDef *led_port,
                                   uint16_t led_pin)
{
    DWORD total = 0;
    if (SD_disk_ioctl(bb->sd, GET_SECTOR_COUNT, &total)
        != RES_OK || total == 0) {
        bb->error |= BLACKBOX_ERR_SD;
        LogError("C\n");  /* C = count fail */
        return 0;
    }

    bb->total_sectors = total;

    uint8_t *buf = bb->dma_buf;
    uint32_t lo = 0;
    uint32_t hi = total;

    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        HAL_GPIO_TogglePin(led_port, led_pin);

        if (SD_disk_read(bb->sd, buf, mid, 1) != RES_OK) {
            bb->error |= BLACKBOX_ERR_SD;
            LogError("R\n");  /* R = read fail */
            return 0;
        }

        /* Check if sector is all zeros (memcpy avoids aliasing UB) */
        uint32_t nonzero = 0;
        for (uint32_t i = 0; i < BLACKBOX_HALF_SIZE; i += 4) {
            uint32_t word;
            memcpy(&word, &buf[i], sizeof(word));
            nonzero |= word;
        }

        if (nonzero)
            lo = mid + 1;
        else
            hi = mid;
    }

    return lo;
}

void blackbox_process(Blackbox *bb)
{
    if (bb->write_pending[0]) {
        if (bb->total_sectors > 0
            && bb->next_sector >= bb->total_sectors) {
            bb->error |= BLACKBOX_ERR_FULL;
        } else if (SD_disk_write(bb->sd, &bb->dma_buf[0],
                          bb->next_sector++, 1) != RES_OK) {
            bb->error |= BLACKBOX_ERR_SD;
        }
        bb->write_pending[0] = 0;
    }

    if (bb->write_pending[1]) {
        if (bb->total_sectors > 0
            && bb->next_sector >= bb->total_sectors) {
            bb->error |= BLACKBOX_ERR_FULL;
        } else if (SD_disk_write(bb->sd,
                          &bb->dma_buf[BLACKBOX_HALF_SIZE],
                          bb->next_sector++, 1) != RES_OK) {
            bb->error |= BLACKBOX_ERR_SD;
        }
        bb->write_pending[1] = 0;
    }

    if (bb->flush_pending) {
        /* If separator also pending, include it in the flush (I6) */
        uint8_t sep = bb->separator_pending
            ? bb->separator_byte : 0;
        flush_partial(bb, sep);
    } else if (bb->separator_pending) {
        flush_partial(bb, bb->separator_byte);
    }
}
