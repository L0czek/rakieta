#ifndef BLACKBOX_H
#define BLACKBOX_H

#include <stdint.h>
#include "stm32c0xx_hal.h"
#include "sd_functions.h"

#ifdef __cplusplus
extern "C" {
#endif

#define BLACKBOX_DMA_BUF_SIZE  1024
#define BLACKBOX_HALF_SIZE     (BLACKBOX_DMA_BUF_SIZE / 2)
#define BLACKBOX_START_SECTOR   0
#define BLACKBOX_TIMEOUT_MS     100
#define BLACKBOX_SEPARATOR_BYTE 0xAA
#define BATTERY_THRESHOLD_MV  3300
#define BATTERY_VREF_MV       3300
#define BATTERY_DIVIDER_NUM   163
#define BATTERY_DIVIDER_DEN   1000
#define BATTERY_LOW_ADC \
    ((BATTERY_THRESHOLD_MV * BATTERY_DIVIDER_NUM * 4096UL) \
     / ((uint32_t)BATTERY_VREF_MV * BATTERY_DIVIDER_DEN))
#define BATTERY_CHECK_MS        1000

#define BLACKBOX_ERR_SD         (1 << 0)
#define BLACKBOX_ERR_BATTERY    (1 << 1)
#define BLACKBOX_ERR_FULL       (1 << 2)

typedef struct {
    uint8_t dma_buf[BLACKBOX_DMA_BUF_SIZE]
        __attribute__((aligned(4)));
    volatile uint8_t write_pending[2];
    volatile uint8_t flush_pending;
    volatile uint32_t next_sector;
    uint32_t total_sectors;
    uint32_t timeout_ms;
    volatile uint16_t last_ndtr;
    volatile uint32_t idle_ticks;
    volatile uint8_t error;
    volatile uint8_t separator_pending;
    uint8_t separator_byte;
    SD_Context *sd;
    UART_HandleTypeDef *huart;
} Blackbox;

void blackbox_init(Blackbox *bb, SD_Context *sd,
                   UART_HandleTypeDef *huart,
                   uint32_t start_sector,
                   uint32_t timeout_ms);
void blackbox_start(Blackbox *bb);
void blackbox_tick(Blackbox *bb);
void blackbox_process(Blackbox *bb);
uint32_t blackbox_find_free_sector(Blackbox *bb,
                                   GPIO_TypeDef *led_port,
                                   uint16_t led_pin);

#ifdef __cplusplus
}
#endif

#endif /* BLACKBOX_H */
