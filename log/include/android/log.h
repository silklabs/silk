#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef enum android_LogPriority {
  ANDROID_LOG_UNKNOWN = 0,
  ANDROID_LOG_DEFAULT,
  ANDROID_LOG_VERBOSE,
  ANDROID_LOG_DEBUG,
  ANDROID_LOG_INFO,
  ANDROID_LOG_WARN,
  ANDROID_LOG_ERROR,
  ANDROID_LOG_FATAL,
  ANDROID_LOG_SILENT,
} android_LogPriority;

void __android_log_write(int prio, char const *tag, char const *message);
void __android_log_print(int prio, const char *tag,  const char *fmt, ...);

#ifndef NO_LOG_INLINE
#include "../../log.c"
#endif

#ifdef __cplusplus
}
#endif
