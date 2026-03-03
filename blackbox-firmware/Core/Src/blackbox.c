#include "blackbox.h"
#include "logging.h"
#include "sd_functions.h"
#include <string.h>

void blackbox_init(Blackbox *bb, SD_Context *sd,
                   UART_HandleTypeDef *huart,
                   uint32_t start_sector,
                   uint32_t timeout_ms)
{
    memset(bb->dma_buf, 0, BLACKBOX_DMA_BUF_SIZE);
    bb->is_active = 1;
    bb->buffer_to_write = 0;
    bb->do_write = 0;
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
    bb->push_separator = 0;
    bb->writing_to_sd_in_progress = 0;
}

void blackbox_start(Blackbox *bb)
{
    HAL_UART_Receive_DMA(bb->huart, bb->dma_buf,
                         BLACKBOX_DMA_BUF_SIZE);
}

void blackbox_tick(Blackbox *bb)
{
    DMA_HandleTypeDef *hdma = bb->huart->hdmarx;
    uint16_t ndtr = (uint16_t)__HAL_DMA_GET_COUNTER(hdma);

    if (ndtr == bb->last_ndtr && ndtr != BLACKBOX_DMA_BUF_SIZE) {
        bb->idle_ticks++;
        if (bb->idle_ticks >= bb->timeout_ms) {
            bb->flush_pending = 1;
            bb->idle_ticks = 0;
            bb->is_active = 0;
        }
    } else {
        bb->idle_ticks = 0;
        bb->last_ndtr = ndtr;
    }
}

uint32_t blackbox_find_free_sector(Blackbox *bb) {
    DWORD total = 0;
    if (SD_disk_ioctl(bb->sd, GET_SECTOR_COUNT, &total)
        != RES_OK || total == 0) {
        bb->error |= BLACKBOX_ERR_SD;
        return 0;
    }

    bb->total_sectors = total;

    uint8_t *buf = bb->dma_buf;
    uint32_t lo = 0;
    uint32_t hi = total;

    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;

        if (SD_disk_read(bb->sd, buf, mid, 1) != RES_OK) {
            bb->error |= BLACKBOX_ERR_SD;
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
    if (!bb->do_write && !bb->flush_pending && !bb->push_separator)
        return;

    if (bb->next_sector >= bb->total_sectors) {
        bb->error |= BLACKBOX_ERR_FULL;
        bb->do_write = 0;
        return;
    }

    if (bb->do_write)
        blackbox_write_buffer(bb, bb->next_sector++);

    // if (bb->flush_pending)
    //     blackbox_write_buffer(bb, bb->next_sector);

    if (bb->push_separator) {
        // void *buf = &bb->dma_buf[BLACKBOX_HALF_SIZE * bb->buffer_to_write];
        // memset(buf, 0xaa, bb->sector_size);
        // blackbox_write_buffer(bb, bb->next_sector++);
    }
}

void blackbox_write_buffer(Blackbox *bb, uint32_t sector) {
    bb->writing_to_sd_in_progress = 1;
    void *buf = &bb->dma_buf[BLACKBOX_HALF_SIZE * bb->buffer_to_write];
    if (SD_disk_write(bb->sd, buf, sector, BLACKBOX_HALF_SIZE / 512) != RES_OK)
        bb->error |= BLACKBOX_ERR_SD;

    bb->is_active = 1;
    bb->writing_to_sd_in_progress = 0;
}
