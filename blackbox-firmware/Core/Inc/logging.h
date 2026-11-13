#ifndef __LOGGING_H__
#define __LOGGING_H__

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Uncomment (or pass -DENABLE_SEMIHOST_LOGGING) to send diagnostics to an
 * attached debugger over semihosting. This also enables the UART rate
 * statistics in main.c.
 * NOTE: Enabling logging overflows the 16 KiB flash of the STM32C011F4. */
//#define ENABLE_SEMIHOST_LOGGING

void Log_SemihostText(const char *text);
void Log_SemihostHex8(uint8_t value);
void Log_SemihostHex32(uint32_t value);

#ifdef __cplusplus
}
#endif

#endif
