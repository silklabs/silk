//#define LOG_NDEBUG 0
#define LOG_TAG "silk-time_genoff"
#include <dlfcn.h>
#include <fcntl.h>
#include <errno.h>
#include <linux/rtc.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <utils/Log.h>
#include "time_genoff.h"

extern "C" {
int settime_alarm_timeval(struct timeval *tv); /* date.c */
int settime_rtc_timeval(struct timeval *tv);   /* date.c */
}

// Read the current value of the RTC clock
// (this is expected to be in UTC)
int get_rtc_ms()
{
  int fd = open("/dev/rtc0", O_RDONLY);
  if (fd < 0) {
    ALOGE("Unable to open /dev/rtc0: err=%d errno=%d", fd, errno);
    return 0;
  }

  struct rtc_time rtc;
  int err = ioctl(fd, RTC_RD_TIME, &rtc);
  close(fd);
  if (err < 0) {
    ALOGE("Unable to RTC_RD_TIME: err=%d errno=%d", err, errno);
    return 0;
  }

  struct tm tm;
  tm.tm_sec = rtc.tm_sec;
  tm.tm_min = rtc.tm_min;
  tm.tm_hour = rtc.tm_hour;
  tm.tm_mday = rtc.tm_mday;
  tm.tm_mon = rtc.tm_mon;
  tm.tm_year = rtc.tm_year;
  tm.tm_wday = rtc.tm_wday;
  tm.tm_yday = rtc.tm_yday;
  tm.tm_isdst = rtc.tm_isdst;

  return mktime(&tm);
}


// The RTC clock is read-only on some QC SoCs.  On these devices the system clock offset
// to the RTC is given to libtime_genoff so that the time can be restored
// at next reboot by the QC time_daemon.
//
// Returns true if libtime_genoff.so exists on this device
bool set_time_genoff(int64_t new_utc_time_ms)
{
  void *handle = dlopen("/vendor/lib/libtime_genoff.so", RTLD_NOW);
  if (handle == NULL) {
    ALOGW("Unable to dlopen libtime_genoff.so");
    return false; // Probably not an error, libtime_genoff.so is not required for all devices
  }

  typedef int (*time_genoff_operation)(time_genoff_info_type *pargs);
  time_genoff_operation op = reinterpret_cast<time_genoff_operation>(dlsym(handle, "time_genoff_operation"));
  if (op == NULL) {
    ALOGW("Unable to dlsym time_genoff_operation");
    return true;
  }

  uint64_t rtc_offset = new_utc_time_ms + get_rtc_ms(); // Offset is in UTC :-/

  time_genoff_info_type args = {
    ATS_USER,
    &rtc_offset,
    TIME_MSEC,
    T_SET
  };

  // Adjust RTC offset of the ATS_USER clock by the provided time delta
  args.operation = T_SET;

  int err = op(&args);
  if (err != 0) {
    ALOGE("time_genoff T_SET failed: %d", err);
  } else {
    ALOGI("new RTC offset: %llums", rtc_offset);
  }
  return true;
}


void set_system_time(int64_t new_time_ms)
{
  struct timeval tv = {
    .tv_sec = static_cast<long int>(new_time_ms / 1000),
    .tv_usec = static_cast<long int>((new_time_ms % 1000) * 1000),
  };
  int err = settime_alarm_timeval(&tv);
  if (err < 0) {
    ALOGW("settime_alarm_timeval: err=%d (errno: %d)\n", err, errno);
    err = settime_rtc_timeval(&tv);
    if (err < 0) {
      ALOGW("settime_rtc_timeval: err=%d (errno: %d)\n", err, errno);
      // RTC clock is read-only sometimes, don't bail out here
    }
  }
}


int main(int argc, char **argv)
{
  if (argc != 2) {
    printf("Usage: time_genoff <utc_ms_since_1970_epoch>\n"
           "\n"
           "Sets the system time to the provided UTC time value\n");
    return 1;
  }

  // Fetch the current GMT offset (epoch_tm.tm_gmtoff)
  time_t epoch = 0;
  struct tm epoch_tm;
  localtime_r(&epoch, &epoch_tm);

  // The new time
  int64_t new_utc_time_ms = strtoll(argv[1], NULL, 0);
  int64_t new_local_time_ms = new_utc_time_ms + epoch_tm.tm_gmtoff * 1000;

  // Set the system time offset to the (maybe) read-only RTC
  bool have_time_genoff = set_time_genoff(new_utc_time_ms);

  // Set the new system time.  "time_genoff.so" devices use local time here
  // instead of UTC to meet the expectations of QC time_daemon on next reboot.
  set_system_time(have_time_genoff ? new_local_time_ms : new_utc_time_ms);
  return 0;
}
