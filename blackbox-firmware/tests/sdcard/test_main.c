/**
 * @file test_main.c
 * @brief SD Card library tests with semihosting output
 */

#include <stdio.h>
#include <string.h>
#include "stm32c0xx_hal.h"
#include "sd_functions.h"

extern void initialise_monitor_handles(void);

/* Peripheral handles */
SPI_HandleTypeDef hspi1;
DMA_HandleTypeDef hdma_spi1_tx;
DMA_HandleTypeDef hdma_spi1_rx;

/* SD Card context */
SD_Context sd_ctx;

/* Test buffers - use a safe sector for testing (sector 1000+) */
#define TEST_SECTOR 1000
static uint8_t write_buffer[512] __attribute__((aligned(4)));
static uint8_t read_buffer[512] __attribute__((aligned(4)));

/* Test counters */
static int tests_passed = 0;
static int tests_failed = 0;

/* Function prototypes */
static void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_DMA_Init(void);
static void MX_SPI1_Init(void);
void Error_Handler(void);

/* Test helper macros */
#define TEST_ASSERT(condition, name) do { \
    if (condition) { \
        printf("  [PASS] %s\n", name); \
        tests_passed++; \
    } else { \
        printf("  [FAIL] %s\n", name); \
        tests_failed++; \
    } \
} while(0)

/* HAL SPI callbacks - forward to SD library */
void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if (hspi == &hspi1) {
        SD_spi_tx_complete(&sd_ctx);
    }
}

void HAL_SPI_RxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if (hspi == &hspi1) {
        SD_spi_rx_complete(&sd_ctx);
    }
}

void HAL_SPI_TxRxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if (hspi == &hspi1) {
        SD_spi_txrx_complete(&sd_ctx);
    }
}

/***************************************
 * Test Functions
 **************************************/

static void test_sd_init(void)
{
    printf("\n[TEST] SD Card Initialization\n");
    
    /* Initialize SD context */
    SD_init(&sd_ctx, &hspi1, GPIOA, GPIO_PIN_4);
    TEST_ASSERT(sd_ctx.status == STA_NOINIT, "Initial status is STA_NOINIT");
    
    /* Initialize SD card */
    printf("  Initializing SD card...\n");
    DSTATUS status = SD_disk_initialize(&sd_ctx);
    
    TEST_ASSERT(!(status & STA_NOINIT), "SD card initialized");
    TEST_ASSERT(!(status & STA_NODISK), "SD card present");
    
    if (status == 0) {
        printf("  Card type: ");
        if (sd_ctx.card_type & CT_SD2) {
            if (sd_ctx.card_type & CT_BLOCK) {
                printf("SDHC/SDXC (block addressing)\n");
            } else {
                printf("SD v2 (byte addressing)\n");
            }
        } else if (sd_ctx.card_type & CT_SD1) {
            printf("SD v1\n");
        } else if (sd_ctx.card_type & CT_MMC) {
            printf("MMC\n");
        } else {
            printf("Unknown\n");
        }
    }
}

static void test_sd_ioctl(void)
{
    printf("\n[TEST] SD Card IOCTL\n");
    
    if (sd_ctx.status & STA_NOINIT) {
        printf("  [SKIP] SD card not initialized\n");
        return;
    }
    
    DWORD sector_count = 0;
    WORD sector_size = 0;
    
    DRESULT res = SD_disk_ioctl(&sd_ctx, GET_SECTOR_COUNT, &sector_count);
    TEST_ASSERT(res == RES_OK, "GET_SECTOR_COUNT");
    if (res == RES_OK) {
        printf("  Sector count: %lu\n", sector_count);
        printf("  Capacity: %lu MB\n", (sector_count / 2048));
    }
    
    res = SD_disk_ioctl(&sd_ctx, GET_SECTOR_SIZE, &sector_size);
    TEST_ASSERT(res == RES_OK, "GET_SECTOR_SIZE");
    if (res == RES_OK) {
        printf("  Sector size: %u bytes\n", sector_size);
    }
}

static void test_sd_read(void)
{
    printf("\n[TEST] SD Card Read\n");
    
    if (sd_ctx.status & STA_NOINIT) {
        printf("  [SKIP] SD card not initialized\n");
        return;
    }
    
    /* Read sector 0 (usually MBR or boot sector) */
    memset(read_buffer, 0, sizeof(read_buffer));
    DRESULT res = SD_disk_read(&sd_ctx, read_buffer, 0, 1);
    TEST_ASSERT(res == RES_OK, "Read sector 0");
    
    if (res == RES_OK) {
        /* Check for MBR signature (0x55, 0xAA at offset 510-511) */
        int has_mbr_sig = (read_buffer[510] == 0x55 && read_buffer[511] == 0xAA);
        printf("  MBR signature: %s\n", has_mbr_sig ? "present" : "not found");
        
        /* Print first 16 bytes */
        printf("  First 16 bytes: ");
        for (int i = 0; i < 16; i++) {
            printf("%02X ", read_buffer[i]);
        }
        printf("\n");
    }
}

/* Expected pattern buffer - saved before write to avoid DMA corruption */
static uint8_t expected_buffer[512] __attribute__((aligned(4)));

static int verify_write(int pattern_id)
{
    DRESULT res;
    
    /* Read back */
    memset(read_buffer, 0, sizeof(read_buffer));
    res = SD_disk_read(&sd_ctx, read_buffer, TEST_SECTOR, 1);
    if (res != RES_OK) {
        printf("  Read failed with error: %d\n", res);
        return 0;
    }
    
    /* Verify data */
    int match = (memcmp(expected_buffer, read_buffer, 512) == 0);
    if (!match) {
        printf("  Pattern %d mismatch! First 16 bytes:\n", pattern_id);
        printf("  Expected: ");
        for (int i = 0; i < 16; i++) printf("%02X ", expected_buffer[i]);
        printf("\n");
        printf("  Read:     ");
        for (int i = 0; i < 16; i++) printf("%02X ", read_buffer[i]);
        printf("\n");
    }
    return match;
}

static void test_sd_write_read(void)
{
    printf("\n[TEST] SD Card Write/Read\n");
    
    if (sd_ctx.status & STA_NOINIT) {
        printf("  [SKIP] SD card not initialized\n");
        return;
    }
    
    DRESULT res;
    int pass;
    
    /* Pattern 1: 0xAA fill with "PAT1" signature */
    printf("  Writing pattern 1 to sector %d...\n", TEST_SECTOR);
    memset(write_buffer, 0xAA, 512);
    write_buffer[0] = 'T';
    write_buffer[1] = 'E';
    write_buffer[2] = 'S';
    write_buffer[3] = 'T';
    memcpy(expected_buffer, write_buffer, 512);  /* Save before write */
    
    res = SD_disk_write(&sd_ctx, write_buffer, TEST_SECTOR, 1);
    TEST_ASSERT(res == RES_OK, "Write pattern 1");
    if (res != RES_OK) return;
    
    SD_disk_ioctl(&sd_ctx, CTRL_SYNC, NULL);
    
    pass = verify_write(1);
    TEST_ASSERT(pass, "Verify pattern 1");
    
    /* Pattern 2: 0x55 fill with "PAT2" signature (inverted from pattern 1) */
    printf("  Writing pattern 2 to sector %d...\n", TEST_SECTOR);
    memset(write_buffer, 0x55, 512);
    write_buffer[0] = 'P';
    write_buffer[1] = 'A';
    write_buffer[2] = 'T';
    write_buffer[3] = '2';
    memcpy(expected_buffer, write_buffer, 512);  /* Save before write */
    
    res = SD_disk_write(&sd_ctx, write_buffer, TEST_SECTOR, 1);
    TEST_ASSERT(res == RES_OK, "Write pattern 2");
    if (res != RES_OK) return;
    
    SD_disk_ioctl(&sd_ctx, CTRL_SYNC, NULL);
    
    pass = verify_write(2);
    TEST_ASSERT(pass, "Verify pattern 2");
}

int main(void)
{
    /* Initialize semihosting */
    initialise_monitor_handles();

    /* MCU Configuration */
    HAL_Init();
    SystemClock_Config();

    /* Initialize peripherals needed for SD card */
    MX_GPIO_Init();
    MX_DMA_Init();
    MX_SPI1_Init();

    printf("\n");
    printf("========================================\n");
    printf("  SD Card Library Test Suite\n");
    printf("========================================\n");

    /* Run tests */
    test_sd_init();
    test_sd_ioctl();
    test_sd_read();
    test_sd_write_read();

    /* Summary */
    printf("\n========================================\n");
    printf("  Test Summary\n");
    printf("========================================\n");
    printf("  Passed: %d\n", tests_passed);
    printf("  Failed: %d\n", tests_failed);
    printf("  Result: %s\n", tests_failed == 0 ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
    printf("========================================\n");

    /* Infinite loop */
    while (1) {
        __WFI();
    }

    return 0;
}

/**
 * @brief System Clock Configuration
 */
static void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    __HAL_FLASH_SET_LATENCY(FLASH_LATENCY_1);

    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    RCC_OscInitStruct.HSIState = RCC_HSI_ON;
    RCC_OscInitStruct.HSIDiv = RCC_HSI_DIV1;
    RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
        Error_Handler();
    }

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1;
    RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
    RCC_ClkInitStruct.SYSCLKDivider = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.AHBCLKDivider = RCC_HCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_APB1_DIV1;

    if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_1) != HAL_OK) {
        Error_Handler();
    }
}

/**
 * @brief GPIO Initialization
 */
static void MX_GPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* SD Card CS pin (PA4) */
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_SET);
    GPIO_InitStruct.Pin = GPIO_PIN_4;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
}

/**
 * @brief DMA Initialization
 */
static void MX_DMA_Init(void)
{
    __HAL_RCC_DMA1_CLK_ENABLE();

    HAL_NVIC_SetPriority(DMA1_Channel1_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel1_IRQn);
    HAL_NVIC_SetPriority(DMA1_Channel2_3_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel2_3_IRQn);
}

/**
 * @brief SPI1 Initialization
 * SD card requires 100-400kHz during init. 48MHz / 256 = 187.5kHz
 */
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

/**
 * @brief Error Handler
 */
void Error_Handler(void)
{
    __disable_irq();
    printf("ERROR: Error_Handler called!\n");
    while (1) {
    }
}
