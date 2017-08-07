#include <stdio.h>
#include <string.h>

#define LOG_TAG "silk-updater"
#include <log/log.h>

#include "librecovery.h"

int main(int argc, char **argv) {
  if (argc != 2) {
    ALOGE("Expected one argument, received %d", argc);
    return 1;
  }

  char const* update_package = argv[1];
  if (access(update_package, F_OK) != 0) {
    ALOGE("Update package does not exist: %s", update_package);
    return 1;
  }
  ALOGI("Update package: %s", update_package);
  return installFotaUpdate(update_package, strlen(update_package));
}
