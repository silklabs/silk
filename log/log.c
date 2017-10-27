#include <stdio.h>
#include <stdarg.h>

#define NO_LOG_INLINE
#include <android/log.h>

__inline void __android_log_write(int prio, char const *tag, char const *message) {
  printf("<%d> %s: %s\n", prio, tag, message);
}

__inline void __android_log_print(int prio, const char *tag, const char *fmt, ...) {
  char buf[512];

  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof buf, fmt, args);
  va_end(args);

  return __android_log_write(prio, tag, buf);
}
