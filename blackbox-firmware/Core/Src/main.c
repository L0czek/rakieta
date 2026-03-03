/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdint.h>
#include <string.h>
#include "sd_functions.h"
#include "blackbox.h"
#include "stm32c0xx_hal_gpio.h"
#include "stm32c0xx_hal_spi.h"
#include "stm32c0xx_hal_tim.h"
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define LED_STATUS_PIN    GPIO_PIN_2
#define LED_ACTIVITY_PIN  GPIO_PIN_3
#define LED_ACTIVITY_ON_TIME    500
#define LED_PORT          GPIOA
#define ACTIVITY_PULSE_MS 50
#define BTN_PIN           GPIO_PIN_1
#define BTN_PORT          GPIOA
#define BTN_DEBOUNCE_MS   20
#define CD_PIN            GPIO_PIN_8
#define CD_PORT           GPIOA
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
ADC_HandleTypeDef hadc1;

SPI_HandleTypeDef hspi1;
DMA_HandleTypeDef hdma_spi1_tx;
DMA_HandleTypeDef hdma_spi1_rx;

TIM_HandleTypeDef htim14;

UART_HandleTypeDef huart1;
DMA_HandleTypeDef hdma_usart1_rx;

/* USER CODE BEGIN PV */
SD_Context sd_ctx;
Blackbox blackbox;
volatile uint8_t activity;
volatile uint32_t activity_ms;
uint32_t battery_check_tick;
uint32_t sd_retry_tick;
uint8_t card_present;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_DMA_Init(void);
static void MX_ADC1_Init(void);
static void MX_SPI1_Init(void);
static void MX_USART1_UART_Init(void);
static void MX_TIM14_Init(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
static void sd_start_logging(void)
{
  blackbox_init(&blackbox, &sd_ctx, &huart1,
                BLACKBOX_START_SECTOR, BLACKBOX_TIMEOUT_MS);

  if (SD_disk_initialize(&sd_ctx) != 0) {
    blackbox.error |= BLACKBOX_ERR_SD;
    return;
  }

  uint32_t free = blackbox_find_free_sector(&blackbox);
  if (blackbox.error & BLACKBOX_ERR_SD) {
    return;
  }

  free = 0;
  blackbox.next_sector = free;

  if (blackbox.next_sector >= blackbox.total_sectors) {
    blackbox.error |= BLACKBOX_ERR_FULL;
    return;
  }

  WORD sector_size = 0;
  if (SD_disk_ioctl(&sd_ctx, GET_SECTOR_SIZE, &sector_size) != RES_OK) {
    blackbox.error |= BLACKBOX_ERR_SD;
    return;
  }
  blackbox.sector_size = sector_size;

  memset(blackbox.dma_buf, 0, BLACKBOX_HALF_SIZE);
  blackbox.dma_buf[0] = BLACKBOX_SEPARATOR_BYTE;
  if (SD_disk_write(&sd_ctx, blackbox.dma_buf,
                    blackbox.next_sector++, 1) != RES_OK) {
    blackbox.error |= BLACKBOX_ERR_SD;
    return;
  }

  memset(blackbox.dma_buf, 0, BLACKBOX_DMA_BUF_SIZE);
  blackbox_start(&blackbox);
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_DMA_Init();
  MX_ADC1_Init();
  MX_SPI1_Init();
  MX_USART1_UART_Init();
  MX_TIM14_Init();
  /* USER CODE BEGIN 2 */
  HAL_ADCEx_Calibration_Start(&hadc1);
  SD_init(&sd_ctx, &hspi1, GPIOA, GPIO_PIN_4);
  sd_start_logging();
  card_present = !(blackbox.error & BLACKBOX_ERR_SD);

  HAL_ADC_Start(&hadc1);
  if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
    uint32_t adc_val = HAL_ADC_GetValue(&hadc1);
    if (adc_val < BATTERY_LOW_ADC) {
      blackbox.error |= BLACKBOX_ERR_BATTERY;
    }
  }
  HAL_ADC_Stop(&hadc1);

  HAL_TIM_Base_Start_IT(&htim14);
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
    {
      while (blackbox.error & BLACKBOX_ERR_OVERRUN)
          ;

      uint8_t inserted = (HAL_GPIO_ReadPin(CD_PORT, CD_PIN)
                          == GPIO_PIN_RESET);
      if (!inserted && card_present) {
        HAL_UART_DMAStop(blackbox.huart);
        blackbox.error |= BLACKBOX_ERR_SD;
        card_present = 0;
      } else if (inserted && !card_present
               && (HAL_GetTick() - sd_retry_tick >= 2000)) {
        sd_start_logging();
        card_present =
            !(blackbox.error & BLACKBOX_ERR_SD);
        if (!card_present)
          sd_retry_tick = HAL_GetTick();
      }
    }
    if (card_present) {
        blackbox_process(&blackbox);
    }
    // uint32_t now = HAL_GetTick();
    // if (now - battery_check_tick >= BATTERY_CHECK_MS) {
    //   battery_check_tick = now;
    //   HAL_ADC_Start(&hadc1);
    //   if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
    //     uint32_t adc_val = HAL_ADC_GetValue(&hadc1);
    //     if (adc_val < BATTERY_LOW_ADC)
    //       blackbox.error |= BLACKBOX_ERR_BATTERY;
    //     else
    //       blackbox.error &= (uint8_t)~BLACKBOX_ERR_BATTERY;
    //   }
    //   HAL_ADC_Stop(&hadc1);
    // }
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  __HAL_FLASH_SET_LATENCY(FLASH_LATENCY_1);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSIDiv = RCC_HSI_DIV1;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.SYSCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_APB1_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_1) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief ADC1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_ADC1_Init(void)
{

  /* USER CODE BEGIN ADC1_Init 0 */

  /* USER CODE END ADC1_Init 0 */

  ADC_ChannelConfTypeDef sConfig = {0};

  /* USER CODE BEGIN ADC1_Init 1 */

  /* USER CODE END ADC1_Init 1 */

  /** Configure the global features of the ADC (Clock, Resolution, Data Alignment and number of conversion)
  */
  hadc1.Instance = ADC1;
  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV2;
  hadc1.Init.Resolution = ADC_RESOLUTION_12B;
  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
  hadc1.Init.ScanConvMode = ADC_SCAN_SEQ_FIXED;
  hadc1.Init.EOCSelection = ADC_EOC_SINGLE_CONV;
  hadc1.Init.LowPowerAutoWait = DISABLE;
  hadc1.Init.LowPowerAutoPowerOff = DISABLE;
  hadc1.Init.ContinuousConvMode = DISABLE;
  hadc1.Init.NbrOfConversion = 1;
  hadc1.Init.DiscontinuousConvMode = DISABLE;
  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;
  hadc1.Init.DMAContinuousRequests = DISABLE;
  hadc1.Init.Overrun = ADC_OVR_DATA_PRESERVED;
  hadc1.Init.SamplingTimeCommon1 = ADC_SAMPLETIME_1CYCLE_5;
  hadc1.Init.OversamplingMode = DISABLE;
  hadc1.Init.TriggerFrequencyMode = ADC_TRIGGER_FREQ_HIGH;
  if (HAL_ADC_Init(&hadc1) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure Regular Channel
  */
  sConfig.Channel = ADC_CHANNEL_11;
  sConfig.Rank = ADC_RANK_CHANNEL_NUMBER;
  if (HAL_ADC_ConfigChannel(&hadc1, &sConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN ADC1_Init 2 */

  /* USER CODE END ADC1_Init 2 */

}

/**
  * @brief SPI1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_SPI1_Init(void)
{

  /* USER CODE BEGIN SPI1_Init 0 */

  /* USER CODE END SPI1_Init 0 */

  /* USER CODE BEGIN SPI1_Init 1 */

  /* USER CODE END SPI1_Init 1 */
  /* SPI1 parameter configuration*/
  hspi1.Instance = SPI1;
  hspi1.Init.Mode = SPI_MODE_MASTER;
  hspi1.Init.Direction = SPI_DIRECTION_2LINES;
  hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
  hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
  hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
  hspi1.Init.NSS = SPI_NSS_SOFT;
  hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_4;
  hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;
  hspi1.Init.TIMode = SPI_TIMODE_DISABLE;
  hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
  hspi1.Init.CRCPolynomial = 7;
  hspi1.Init.CRCLength = SPI_CRC_LENGTH_DATASIZE;
  hspi1.Init.NSSPMode = SPI_NSS_PULSE_ENABLE;
  if (HAL_SPI_Init(&hspi1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN SPI1_Init 2 */

  /* USER CODE END SPI1_Init 2 */

}

/**
  * @brief TIM14 Initialization Function
  * @param None
  * @retval None
  */
static void MX_TIM14_Init(void)
{

  /* USER CODE BEGIN TIM14_Init 0 */

  /* USER CODE END TIM14_Init 0 */

  /* USER CODE BEGIN TIM14_Init 1 */

  /* USER CODE END TIM14_Init 1 */
  htim14.Instance = TIM14;
  htim14.Init.Prescaler = 47;
  htim14.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim14.Init.Period = 999;
  htim14.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim14.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_Base_Init(&htim14) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM14_Init 2 */

  /* USER CODE END TIM14_Init 2 */

}

/**
  * @brief USART1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART1_UART_Init(void)
{

  /* USER CODE BEGIN USART1_Init 0 */

  /* USER CODE END USART1_Init 0 */

  /* USER CODE BEGIN USART1_Init 1 */

  /* USER CODE END USART1_Init 1 */
  huart1.Instance = USART1;
  huart1.Init.BaudRate = 3000000;
  huart1.Init.WordLength = UART_WORDLENGTH_8B;
  huart1.Init.StopBits = UART_STOPBITS_1;
  huart1.Init.Parity = UART_PARITY_NONE;
  huart1.Init.Mode = UART_MODE_RX;
  huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart1.Init.OverSampling = UART_OVERSAMPLING_16;
  huart1.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
  huart1.Init.ClockPrescaler = UART_PRESCALER_DIV1;
  huart1.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;
  if (HAL_HalfDuplex_Init(&huart1) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_UARTEx_SetTxFifoThreshold(&huart1, UART_TXFIFO_THRESHOLD_1_8) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_UARTEx_SetRxFifoThreshold(&huart1, UART_RXFIFO_THRESHOLD_1_8) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_UARTEx_DisableFifoMode(&huart1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART1_Init 2 */

  /* USER CODE END USART1_Init 2 */

}

/**
  * Enable DMA controller clock
  */
static void MX_DMA_Init(void)
{

  /* DMA controller clock enable */
  __HAL_RCC_DMA1_CLK_ENABLE();

  /* DMA interrupt init */
  /* DMA1_Channel1_IRQn interrupt configuration */
  HAL_NVIC_SetPriority(DMA1_Channel1_IRQn, 0, 0);
  HAL_NVIC_EnableIRQ(DMA1_Channel1_IRQn);
  /* DMA1_Channel2_3_IRQn interrupt configuration */
  HAL_NVIC_SetPriority(DMA1_Channel2_3_IRQn, 0, 0);
  HAL_NVIC_EnableIRQ(DMA1_Channel2_3_IRQn);

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_2|GPIO_PIN_3|GPIO_PIN_4, GPIO_PIN_RESET);

  /*Configure GPIO pins : PA1 PA8 */
  GPIO_InitStruct.Pin = GPIO_PIN_1|GPIO_PIN_8;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pins : PA2 PA3 */
  GPIO_InitStruct.Pin = GPIO_PIN_2|GPIO_PIN_3;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pin : PA4 */
  GPIO_InitStruct.Pin = GPIO_PIN_4;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /* USER CODE BEGIN MX_GPIO_Init_2 */

  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */
void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi)
{
  if (hspi->Instance == SPI1)
    SD_spi_tx_complete(&sd_ctx);
}

void HAL_SPI_RxCpltCallback(SPI_HandleTypeDef *hspi)
{
  if (hspi->Instance == SPI1)
    SD_spi_rx_complete(&sd_ctx);
}

void HAL_SPI_TxRxCpltCallback(SPI_HandleTypeDef *hspi)
{
  if (hspi->Instance == SPI1)
    SD_spi_txrx_complete(&sd_ctx);
}

void HAL_UART_RxHalfCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        blackbox.buffer_to_write = 0;
        blackbox.do_write = 1;

        if (blackbox.writing_to_sd_in_progress == 1)
            blackbox.error |= BLACKBOX_ERR_OVERRUN;
    }
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        blackbox.buffer_to_write = 1;
        blackbox.do_write = 1;

        if (blackbox.writing_to_sd_in_progress == 1)
            blackbox.error |= BLACKBOX_ERR_OVERRUN;
    }
}

static volatile enum : uint8_t {
    StatusLEDIdle,
    StatusLEDBlinking,
    StatusLEDBlanking
} status_led_state = StatusLEDIdle;

static void periodic_task_handler()
{
    blackbox_tick(&blackbox);

    /* ---------------- Activity LED (unchanged) ---------------- */

    static volatile uint32_t activity_deltatime = 0;
    if (blackbox.is_active) {
        if (activity_deltatime++ >= LED_ACTIVITY_ON_TIME) {
            HAL_GPIO_TogglePin(LED_PORT, LED_ACTIVITY_PIN);
            activity_deltatime = 0;
        }
    } else {
        HAL_GPIO_WritePin(LED_PORT, LED_ACTIVITY_PIN, GPIO_PIN_RESET);
    }

    /* ---------------- Status LED (error blinking) ---------------- */

    static uint32_t status_timer = 0;
    static uint8_t blink_count = 0;
    static uint8_t blink_target = 0;
    static uint8_t led_on = 0;

    uint8_t err = blackbox.error;

    switch (status_led_state)
    {
        case StatusLEDIdle:
            HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN, GPIO_PIN_RESET);

            if (err)
            {
                blink_target = err;
                blink_count  = 0;
                status_timer = 0;
                led_on       = 1;

                HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN, GPIO_PIN_SET);

                status_led_state = StatusLEDBlinking;
            }
            break;

        case StatusLEDBlinking:
            if (++status_timer >= 500)   // 500 ms
            {
                status_timer = 0;
                if (led_on)
                {
                    // Turn LED OFF (end of ON phase)
                    HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN, GPIO_PIN_RESET);
                    led_on = 0;
                }
                else
                {
                    // Completed one full blink (ON + OFF)
                    blink_count++;
                    if (blink_count >= blink_target)
                    {
                        // All blinks done → go to 3 second pause
                        status_led_state = StatusLEDBlanking;
                    }
                    else
                    {
                        // Start next blink
                        HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN, GPIO_PIN_SET);
                        led_on = 1;
                    }
                }
            }
            break;

        case StatusLEDBlanking:

            HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN, GPIO_PIN_RESET);

            if (++status_timer >= 3000)  // 3 seconds pause
            {
                status_timer = 0;
                if (err)
                {
                    // Restart blinking same error
                    blink_target = err;
                    blink_count  = 0;
                    led_on       = 1;

                    HAL_GPIO_WritePin(LED_PORT, LED_STATUS_PIN, GPIO_PIN_SET);

                    status_led_state = StatusLEDBlinking;
                }
                else
                {
                    status_led_state = StatusLEDIdle;
                }
            }
            break;
    }


    // ========================= BUTTON DEBOUNCE =========================
    //
    static uint8_t button_stable_state = 1;
    static uint16_t button_debounce_counter = 0;
    uint8_t button_raw = HAL_GPIO_ReadPin(BTN_PORT, BTN_PIN);  // 1 = not pressed, 0 = pressed

    if (button_raw != button_stable_state)
    {
        if (++button_debounce_counter >= 50)  // 50 ms debounce time
        {
            button_stable_state = button_raw;
            button_debounce_counter = 0;

            if (button_stable_state == GPIO_PIN_RESET)
                blackbox.push_separator = 1;
        }
    }
    else
    {
        button_debounce_counter = 0;
    }
}

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim == &htim14)
        periodic_task_handler();
}

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
