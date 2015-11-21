/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-time_genoff"
#include <dlfcn.h>
#include <stdlib.h>
#include <utils/Log.h>
#include "time_genoff.h"

int main(int argc, char **argv)
{
  if (argc != 2) {
    printf("Usage: time_genoff <time_delta_ms>\n");
    printf("\n");
    printf("Updates the user clock offset to the RTC so that the system\n");
    printf("time can be restored at next reboot by the QC time_daemon\n");
    printf("\n");
    printf("time_delta_ms - difference in milliseconds between the current\n");
    printf("                system time and the new system time\n");
    return 1;
  }

  int64_t time_delta_ms = strtoll(argv[1], NULL, 0);

  void *handle = dlopen("/vendor/lib/libtime_genoff.so", RTLD_NOW);
  if (handle == NULL) {
    ALOGW("Unable to dlopen libtime_genoff.so");
    return 1;
  }

  typedef int (*time_genoff_operation)(time_genoff_info_type *pargs);
  time_genoff_operation op = reinterpret_cast<time_genoff_operation>(dlsym(handle, "time_genoff_operation"));
  if (op == NULL) {
    ALOGW("Unable to dlsym time_genoff_operation");
    return 1;
  }

  uint64_t ts_val = 0;
  time_genoff_info_type args = {
    ATS_USER,
    &ts_val,
    TIME_MSEC,
    T_GET
  };

  // Retrieve the RTC offset of the ATS_USER clock
  int err = op(&args);
  if (err != 0) {
    ALOGE("time_genoff T_GET failed: %d", err);
    return 1;
  }
  ALOGI("current offset: %llums", ts_val);

  // Adjust RTC offset of the ATS_USER clock by the provided time delta
  args.operation = T_SET;
  ts_val = ts_val + time_delta_ms;
  ALOGI("time_delta_ms: %lldms", time_delta_ms);

  err = op(&args);
  if (err != 0) {
    ALOGE("time_genoff T_SET failed: %d", err);
    return 1;
  }
  ALOGI("new offset: %llums", ts_val);

  return 0;
}
