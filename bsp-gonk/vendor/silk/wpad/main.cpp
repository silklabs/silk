/*
  This program initializes wifi and the wpa_supplicant, and reports all
  wpa_supplicant events to /dev/socket/wpad
*/

#define LOG_TAG "silk-wpad"
#include <utils/Log.h>

#include <cutils/properties.h>
#include <hardware_legacy/wifi.h>
#include <poll.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sysutils/FrameworkListener.h>
#include <private/android_filesystem_config.h>  // for AID_WIFI

class WpaListener : private FrameworkListener {
public:
  WpaListener() : FrameworkListener("wpad") {}

  int start() {
    return FrameworkListener::startListener();
  }

  void sendEvent(const char *event) {
    FrameworkListener::sendBroadcast(200, event, false);
  }
};


#define BAIL_ON_FAIL(expression) \
  { \
    int err = expression; \
    if (err < 0) { \
      ALOGE(#expression " failed: %d\n", err); \
      exit(1); \
    } \
  } \


int main(int, char **)
{
  char hardware[PROPERTY_VALUE_MAX] = {0};
  char board[PROPERTY_VALUE_MAX] = {0};
  property_get("ro.hardware", hardware, NULL);
  property_get("ro.silk.build.board", board, NULL);

  if (!strcmp(hardware, "goldfish")) {
    ALOGW("Goldfish has no wifi");
    for (;;) {
      sleep(INT_MAX);
    }
    return 1;
  }

  // wpa_supplicant fails to gracefully handle a zero-length or unreadable
  // config file.  This can happen if the device crashes at just the right time.
  // Recovery is just a matter of removing the config file, which causes the
  // supplicant to re-create the file with defaults.
  struct stat statbuf;
  const char *wpa_supplicant_conf = "/data/misc/wifi/wpa_supplicant.conf";
  if (0 == stat(wpa_supplicant_conf, &statbuf)) {
    if (statbuf.st_size == 0 || statbuf.st_gid != AID_WIFI)  {
      ALOGW("Removing invalid config file: %s", wpa_supplicant_conf);
      unlink(wpa_supplicant_conf);
    }
  }

  wifi_stop_supplicant(false);
  wifi_unload_driver();

  // Block until netd is operational.  Mako uses netd (ndc) to reload its
  // firmware but in general networking overall isn't going to get very far
  // until netd is up, so might as well wait for it.
  while (access("/data/misc/net/netd_pid", F_OK) != 0) {
    ALOGI("Waiting for netd to start");
    sleep(1);
  }

  // Mako wants its firmware reloaded, all other devices don't seem to need this.
  if (0 == strcmp(board, "mako") || 0 == strcmp(board, "oneplus3")) {
    BAIL_ON_FAIL(system("/system/bin/logwrapper /system/bin/ndc softap fwreload wlan0 AP"));
    ALOGI("reloaded firmware");
  }

  // Kenzo waits for the wlan.driver.ath to be set by wcnss_service
  // before it's safe to load the kernel wlan driver
  if (0 == strcmp(board, "kenzo")) {
    char value[PROPERTY_VALUE_MAX] = {0};
    while (strlen(value) == 0) {
      property_get("wlan.driver.ath", value, "");
      ALOGI("Waiting for firmware ready signal");
      sleep(1);
    }
    ALOGI("Firmware ready. wlan.driver.ath=%s", value);
  }

  ALOGI("Loading driver");
  BAIL_ON_FAIL(wifi_load_driver());
  ALOGI("Driver loaded");
  BAIL_ON_FAIL(wifi_start_supplicant(false));
  ALOGI("Started supplicant");

  // wifi driver (including .ko) loaded, can run as user wifi instead of root
  BAIL_ON_FAIL(setgid(AID_WIFI));
  BAIL_ON_FAIL(setuid(AID_WIFI));

  // A successful return from wifi_start_supplicant() does not guarantee that
  // the supplicant's socket is ready to be connected to so try
  // wifi_connect_to_supplicant() a couple times before declaring failure.
  int retry = 1;
  for (;;) {
    poll(NULL, 0, 250);
    if (retry >= 5) {
      BAIL_ON_FAIL(wifi_connect_to_supplicant());
      break;
    }
    if (0 == wifi_connect_to_supplicant()) {
      break;
    }
    ALOGW("Unable to connect to supplicant, attempt %d\n", retry++);
  }
  ALOGI("Connected to supplicant");

  WpaListener wpad;
  BAIL_ON_FAIL(wpad.start());

  for (;;) {
    char event[255];
    BAIL_ON_FAIL(wifi_wait_for_event(event, sizeof(event)-1));
    wpad.sendEvent(event);
  }
  return 1;
}
