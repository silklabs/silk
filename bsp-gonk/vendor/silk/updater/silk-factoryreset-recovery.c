#define LOG_TAG "silk-factoryreset"
#include <log/log.h>

#include "librecovery.h"

int main(int argc, char **argv) {
  if (argc != 1) {
    ALOGE("Expected no arguments, received %d", argc);
    return 1;
  }

  ALOGI("Starting factory reset");
  return factoryReset();
}
