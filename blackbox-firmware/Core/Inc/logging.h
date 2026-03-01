#ifndef __LOGGING_H__
#define __LOGGING_H__

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void LogInfo(const char *msg);
void LogError(const char *msg);

#ifdef __cplusplus
}
#endif

#endif
