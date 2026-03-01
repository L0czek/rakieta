/**
 * @file test_main.c
 * @brief SD Card library tests — lightweight semihosting via BKPT
 *
 * Logging uses raw ARM semihosting SYS_WRITE0 (BKPT 0xAB).
 * No rdimon/stdio/printf needed — costs ~0 bytes of library code.
 * Requires a semihosting-capable debug probe (probe-rs, OpenOCD).
 *
 * Result signaling:
 *   PA0 HIGH = all tests passed
 *   PA0 LOW  = at least one test failed
 */

#include <string.h>
#include "stm32c0xx_hal.h"
#include "sd_functions.h"

/***************************************
 * Minimal semihosting — raw BKPT 0xAB
 **************************************/

static void sh_puts(const char *s)
{
    __asm__ volatile (
        "mov r0, #0x04\n"  /* SYS_WRITE0 */
        "mov r1, %0\n"
        "bkpt 0xab\n"
        :
        : "r"(s)
        : "r0", "r1", "memory"
    );
}

static void sh_putint(int val)
{
    char buf[12];
    char *p = buf + sizeof(buf) - 1;
    *p = '\0';
    int neg = (val < 0);
    unsigned int u = neg ? (unsigned int)(-val) : (unsigned int)val;
    do {
        *(--p) = '0' + (u % 10);
        u /= 10;
    } while (u);
    if (neg) *(--p) = '-';
    sh_puts(p);
}

/* Peripheral handles */
SPI_HandleTypeDef hspi1;
DMA_HandleTypeDef hdma_spi1_tx;
DMA_HandleTypeDef hdma_spi1_rx;

/* SD Card context */
SD_Context sd_ctx;

/* Test buffers */
#define TEST_SECTOR 1000
static uint8_t write_buffer[512] __attribute__((aligned(4)));
static uint8_t read_buffer[512] __attribute__((aligned(4)));
static uint8_t expected_buffer[512] __attribute__((aligned(4)));

/* Test results — inspect via debugger */
volatile int tests_passed = 0;
volatile int tests_failed = 0;
volatile int tests_done = 0;

/* Function prototypes */
static void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_DMA_Init(void);
static void MX_SPI1_Init(void);
void Error_Handler(void);

#define _STR(x) #x
#define _TOSTR(x) _STR(x)
#define TEST_ASSERT(cond) do { \
    if (cond) { \
        tests_passed++; \
    } else { \
        tests_failed++; \
        sh_puts("  FAIL: " #cond " @ line " _TOSTR(__LINE__) "\n"); \
    } \
} while (0)

/* HAL SPI callbacks — forward to SD library */
void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if (hspi == &hspi1) SD_spi_tx_complete(&sd_ctx);
}

void HAL_SPI_RxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if (hspi == &hspi1) SD_spi_rx_complete(&sd_ctx);
}

void HAL_SPI_TxRxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if (hspi == &hspi1) SD_spi_txrx_complete(&sd_ctx);
}

/***************************************
 * Test Functions
 **************************************/

static void test_sd_init(void)
{
    sh_puts("[TEST] sd_init\n");
    SD_init(&sd_ctx, &hspi1, GPIOA, GPIO_PIN_4);
    TEST_ASSERT(sd_ctx.status == STA_NOINIT);

    DSTATUS status = SD_disk_initialize(&sd_ctx);
    TEST_ASSERT(!(status & STA_NOINIT));
    TEST_ASSERT(!(status & STA_NODISK));
}

static void test_sd_ioctl(void)
{
    sh_puts("[TEST] sd_ioctl\n");
    if (sd_ctx.status & STA_NOINIT) return;

    DWORD sector_count = 0;
    WORD sector_size = 0;

    TEST_ASSERT(SD_disk_ioctl(&sd_ctx, GET_SECTOR_COUNT,
                              &sector_count) == RES_OK);
    TEST_ASSERT(sector_count > 0);

    TEST_ASSERT(SD_disk_ioctl(&sd_ctx, GET_SECTOR_SIZE,
                              &sector_size) == RES_OK);
    TEST_ASSERT(sector_size == 512);
}

static void test_sd_read(void)
{
    sh_puts("[TEST] sd_read\n");
    if (sd_ctx.status & STA_NOINIT) return;

    memset(read_buffer, 0, sizeof(read_buffer));
    TEST_ASSERT(SD_disk_read(&sd_ctx, read_buffer, 0, 1) == RES_OK);
}

static int verify_write(void)
{
    memset(read_buffer, 0, sizeof(read_buffer));
    if (SD_disk_read(&sd_ctx, read_buffer, TEST_SECTOR, 1) != RES_OK)
        return 0;
    return memcmp(expected_buffer, read_buffer, 512) == 0;
}

static void test_sd_write_read(void)
{
    sh_puts("[TEST] sd_write_read\n");
    if (sd_ctx.status & STA_NOINIT) return;

    DRESULT res;

    /* Pattern 1: 0xAA fill */
    memset(write_buffer, 0xAA, 512);
    write_buffer[0] = 'T';
    write_buffer[1] = 'E';
    write_buffer[2] = 'S';
    write_buffer[3] = 'T';
    memcpy(expected_buffer, write_buffer, 512);

    res = SD_disk_write(&sd_ctx, write_buffer, TEST_SECTOR, 1);
    TEST_ASSERT(res == RES_OK);
    if (res != RES_OK) return;
    SD_disk_ioctl(&sd_ctx, CTRL_SYNC, NULL);
    TEST_ASSERT(verify_write());

    /* Pattern 2: 0x55 fill */
    memset(write_buffer, 0x55, 512);
    write_buffer[0] = 'P';
    write_buffer[1] = 'A';
    write_buffer[2] = 'T';
    write_buffer[3] = '2';
    memcpy(expected_buffer, write_buffer, 512);

    res = SD_disk_write(&sd_ctx, write_buffer, TEST_SECTOR, 1);
    TEST_ASSERT(res == RES_OK);
    if (res != RES_OK) return;
    SD_disk_ioctl(&sd_ctx, CTRL_SYNC, NULL);
    TEST_ASSERT(verify_write());
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();

    MX_GPIO_Init();
    MX_DMA_Init();
    MX_SPI1_Init();

    sh_puts("\n=== SD Card Tests ===\n");

    test_sd_init();
    test_sd_ioctl();
    test_sd_read();
    test_sd_write_read();

    /* Print summary */
    sh_puts("\n--- Results: ");
    sh_putint(tests_passed);
    sh_puts(" passed, ");
    sh_putint(tests_failed);
    sh_puts(" failed ---\n");

    /* Signal result on PA0 */
    tests_done = 1;
    if (tests_failed == 0) {
        sh_puts("ALL PASSED\n");
        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_SET);
    } else {
        sh_puts("FAILURES DETECTED\n");
        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);
    }

    while (1) {
        __WFI();
    }

    return 0;
}

static void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    __HAL_FLASH_SET_LATENCY(FLASH_LATENCY_1);

    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    RCC_OscInitStruct.HSIState = RCC_HSI_ON;
    RCC_OscInitStruct.HSIDiv = RCC_HSI_DIV1;
    RCC_OscInitStruct.HSICalibrationValue =
        RCC_HSICALIBRATION_DEFAULT;
    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
        Error_Handler();
    }

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK
        | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1;
    RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
    RCC_ClkInitStruct.SYSCLKDivider = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.AHBCLKDivider = RCC_HCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_APB1_DIV1;

    if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct,
                            FLASH_LATENCY_1) != HAL_OK) {
        Error_Handler();
    }
}

static void MX_GPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* Result pin (PA0) — start LOW (fail) */
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);
    GPIO_InitStruct.Pin = GPIO_PIN_0;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /* SD Card CS pin (PA4) */
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_SET);
    GPIO_InitStruct.Pin = GPIO_PIN_4;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
}

static void MX_DMA_Init(void)
{
    __HAL_RCC_DMA1_CLK_ENABLE();

    HAL_NVIC_SetPriority(DMA1_Channel1_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel1_IRQn);
    HAL_NVIC_SetPriority(DMA1_Channel2_3_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel2_3_IRQn);
}

static void MX_SPI1_Init(void)
{
    hspi1.Instance = SPI1;
    hspi1.Init.Mode = SPI_MODE_MASTER;
    hspi1.Init.Direction = SPI_DIRECTION_2LINES;
    hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
    hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
    hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
    hspi1.Init.NSS = SPI_NSS_SOFT;
    hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_256;
    hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;
    hspi1.Init.TIMode = SPI_TIMODE_DISABLE;
    hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
    hspi1.Init.CRCPolynomial = 7;
    hspi1.Init.CRCLength = SPI_CRC_LENGTH_DATASIZE;
    hspi1.Init.NSSPMode = SPI_NSS_PULSE_DISABLE;
    if (HAL_SPI_Init(&hspi1) != HAL_OK) {
        Error_Handler();
    }
}

void Error_Handler(void)
{
    __disable_irq();
    while (1) {
    }
}
