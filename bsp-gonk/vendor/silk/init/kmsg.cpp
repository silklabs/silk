#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <unistd.h>

#define LOG_TAG "kmsg"
#include <log/log.h>

int main(int argc, char *argv[]) {
  (void) argc;
  (void) argv;

  signal (SIGCHLD,SIG_IGN);

  FILE *fp = fopen("/proc/kmsg", "r");
  if (fp == nullptr) {
    __android_log_write(ANDROID_LOG_ERROR, LOG_TAG,
      "Unable to open /proc/kmsg");
    return 1;
  }

  size_t len = 4096;
  char *line = static_cast<char *>(malloc(len));
  for (;;) {
    // Read the kernel log, line by line
    auto read = getline(&line, &len, fp);
    if (read < 0) {
      __android_log_print(ANDROID_LOG_ERROR, LOG_TAG,
        "getline failure: errno=%d", errno);
      break;
    }

    // Dump each line to logcat for uniformed logging
    __android_log_write(ANDROID_LOG_DEBUG, LOG_TAG, line);

    // Look for a low memory killer message
    #define LMK_MESSAGE_PREFIX "lowmemorykiller: Killing '"
    char *msgStart = strstr(line, LMK_MESSAGE_PREFIX);
    if (msgStart != nullptr) {
      // Found one, fork a child process to crash so that a tombstone is
      // generated to help raise the visibility of the event
      __android_log_print(ANDROID_LOG_WARN, LOG_TAG,
        "Detected a low memory kill, generating a tombstone");

      if (0 == fork()) {
        // Figure the name of the process that was killed
        char *name = msgStart + sizeof(LMK_MESSAGE_PREFIX) - 1;
        for (char *c = name; *c == '\0'; c++) {
          if (*c == '\'') {
            *c = '\0';
            break;
          }
        }

        // Give the child process the same name as the LMKed process, for a
        // better looking tombstone
        prctl(PR_SET_NAME, name);

        // :mushroom:
        *(char *)(void *) 0xDEADBEEF = 42;
      }
    }
  }
  return 0;
}
