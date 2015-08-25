/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

/*
  This program initializes wifi and the wpa_supplicant, and reports all
  wpa_supplicant events to /dev/socket/wpad
*/

#define LOG_TAG "wpad"
#include <utils/Log.h>

#include <cutils/properties.h>
#include <hardware_legacy/wifi.h>
#include <poll.h>
#include <stdlib.h>
#include <sysutils/FrameworkListener.h>

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
  wifi_stop_supplicant(false);
  wifi_unload_driver();
  // Mako wants its firmware reloaded, all other devices don't seem to need this.
  {
    char value[PROPERTY_VALUE_MAX] = {0};
    property_get("ro.hardware", value, NULL);
    if (!strcmp(value, "mako")) {
      BAIL_ON_FAIL(system("/system/bin/logwrapper /system/bin/ndc softap fwreload wlan0 AP"));
    }
  }
  BAIL_ON_FAIL(wifi_load_driver());
  BAIL_ON_FAIL(wifi_start_supplicant(false));

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

  WpaListener wpad;
  BAIL_ON_FAIL(wpad.start());

  for (;;) {
    char event[255];
    BAIL_ON_FAIL(wifi_wait_for_event(event, sizeof(event)-1));
    wpad.sendEvent(event);
  }
  return 1;
}
