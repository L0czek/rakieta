#include "logging.h"

// NOTE: Enabling logging causes overflows!
//#define ENABLE_SEMIHOST_LOGGING

void Log_SemihostText(const char *text)
{
#ifdef ENABLE_SEMIHOST_LOGGING
    __asm__ volatile (
        "mov r0, #0x04\n"
        "mov r1, %0\n"
        "bkpt 0xab\n"
        :
        : "r"(text)
        : "r0", "r1", "memory"
    );
#else
    (void)text;
#endif
}

void Log_SemihostHex8(uint8_t value)
{
#ifdef ENABLE_SEMIHOST_LOGGING
    static const char digits[] = "0123456789ABCDEF";
    char msg[] = "0x00\n";

    msg[2] = digits[(value >> 4) & 0x0F];
    msg[3] = digits[value & 0x0F];
    Log_SemihostText(msg);
#else
    (void)value;
#endif
}

void Log_SemihostHex32(uint32_t value)
{
#ifdef ENABLE_SEMIHOST_LOGGING
    static const char digits[] = "0123456789ABCDEF";
    char msg[] = "0x00000000\n";

    for (uint8_t i = 0; i < 8; ++i) {
        uint8_t shift = (uint8_t)((7U - i) * 4U);
        msg[2 + i] = digits[(value >> shift) & 0x0F];
    }

    Log_SemihostText(msg);
#else
    (void)value;
#endif
}
