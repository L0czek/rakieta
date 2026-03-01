#include "logging.h"

static void sh_write0(const char *str)
{
    __asm volatile (
        "mov r1, %[s]\n\t"
        "movs r0, #0x04\n\t"
        "bkpt #0xab"
        :
        : [s] "r" (str)
        : "r0", "r1", "memory"
    );
}

void LogInfo(const char *msg)
{
    sh_write0("[I] ");
    sh_write0(msg);
}

void LogError(const char *msg)
{
    sh_write0("[E] ");
    sh_write0(msg);
}
