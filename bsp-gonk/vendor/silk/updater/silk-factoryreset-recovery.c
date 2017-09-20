#define LOG_TAG "silk-factoryreset"
#include <log/log.h>

#include "librecovery.h"

int main(int argc, char **argv) {
  if (argc != 1) {
    printf("Expected no arguments, received %d\n", argc);
    ALOGE("Expected no arguments, received %d", argc);
    return 1;
  }

  ALOGI("Starting factory reset");
  printf("Starting factory reset\n");
  return factoryReset();
}
