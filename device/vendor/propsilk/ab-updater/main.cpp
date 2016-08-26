/*
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <cutils/properties.h>
#include <hardware/boot_control.h>
#include <hardware/hardware.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <stdlib.h>
#include <sys/mount.h>

#include "install.h"
#include "roots.h"
#include "ui.h"

#define LOG_TAG "silk-ab-updater"
#include <utils/Log.h>

class StubRecoveryUI: public RecoveryUI {
 public:
  virtual void SetStage(int current, int max) {}
  virtual void SetLocale(const char* locale) {}
  virtual void SetBackground(Icon icon) {}
  virtual void SetProgressType(ProgressType determinate) {}
  virtual void ShowProgress(float portion, float seconds) {
    ALOGE("ui: progress %f %f", portion, seconds);
  }
  virtual void SetProgress(float fraction) {}
  virtual void ShowText(bool visible) {}
  virtual bool IsTextVisible() { return false; }
  virtual bool WasTextEverVisible() { return false; }
  virtual void Print(const char* format, ...) {
    char buffer[256];

    va_list ap;
    va_start(ap, format);
    vsnprintf(buffer, sizeof(buffer), format, ap);
    va_end(ap);

    ALOGI("ui: %s", buffer);
  }
  virtual void ShowFile(const char* filename) {}
  virtual void StartMenu(const char* const * headers, const char* const * items,
                         int initial_selection) {}
  virtual int SelectMenu(int sel) { return sel; }
  virtual void EndMenu() {}
};

RecoveryUI* ui = new StubRecoveryUI();
bool modified_flash = false;

void ui_print(const char* format, ...) {
  char buffer[256];

  va_list ap;
  va_start(ap, format);
  vsnprintf(buffer, sizeof(buffer), format, ap);
  va_end(ap);

  ALOGI("ui: %s", buffer);
}

FILE* fopen_path(const char *path, const char *mode) {
  return fopen(path, mode);
}

int setup_install_mounts() {
  return 0;
}

int ensure_path_mounted(const char* path) {
  (void) path;
  return 0;
}

int main(int argc, char **argv) {
  if (argc != 2) {
    ALOGE("Expected one argument, received %d", argc);
    return 1;
  }
  const char *maybe_cmd = argv[1];

  const hw_module_t *hw_module;
  boot_control_module_t *module;
  int status = hw_get_module("bootctrl", &hw_module);
  if (status != 0) {
    ALOGE("Error getting bootctrl module.");
    return 1;
  }

  module = (boot_control_module_t*) hw_module;
  module->init(module);
  int num_slots = module->getNumberSlots(module);
  int cur_slot = module->getCurrentSlot(module);
  int other_slot = cur_slot ? 0 : 1;
  if (num_slots != 2) {
    ALOGE("Expecting 2 slots, this device has %d", num_slots);
    return 1;
  }
  ALOGI("Active slot: %d  Inactive slot: %d", cur_slot, other_slot);

  char const *active_system;
  char const *active_boot;
  char const *other_system;
  char const *other_boot;

  struct slot {
    char const *boot;
    char const *system;
  };
  struct slot slots[2] = {
    {
      .boot = "/dev/block/bootdevice/by-name/boot_a",
      .system = "/dev/block/bootdevice/by-name/system_a",
    },
    {
      .boot = "/dev/block/bootdevice/by-name/boot_b",
      .system = "/dev/block/bootdevice/by-name/system_b",
    },
  };

  if (0 == strcmp(maybe_cmd, "sync_inactive")) {
    int ret;

    char *bootdd = NULL;
    char *systemdd = NULL;
    asprintf(&bootdd, "/system/bin/logwrapper /system/bin/dd if=%s of=%s",
      slots[cur_slot].boot, slots[other_slot].boot);
    asprintf(&systemdd, "/system/bin/logwrapper /system/bin/dd if=%s of=%s",
      slots[cur_slot].system, slots[other_slot].system);

    ALOGI(bootdd);
    ret = system(bootdd);
    ALOGI("boot dd result: %d", ret);
    if (ret == 0) {
      ALOGI(systemdd);
      ret = system(systemdd);
      ALOGI("system dd result: %d", ret);
    }
    return ret;
  }
  if (0 == strcmp(maybe_cmd, "mount_system_ab")) {
    const char *system_ab = slots[other_slot].system;

    ALOGI("Mounting %s", system_ab);
    int status = mount(system_ab, "/mnt/system_ab", "ext4",
      MS_RDONLY | MS_NOEXEC, "");
    if (status != 0) {
      ALOGE("Unable to mount system_ab: %d (errno=%d)", status, errno);
      return 1;
    }
    return 0;
  }
  if (0 == strcmp(maybe_cmd, "umount_system_ab")) {
    ALOGI("Unmounting /mnt/system_ab");
    int status = umount("/mnt/system_ab");
    if (status != 0) {
      ALOGE("Unable to umount system_ab: %d (errno=%d)", status, errno);
      return 1;
    }
    return 0;
  }

  char const *update_package = maybe_cmd;
  if (access(update_package, F_OK) != 0) {
    ALOGE("Update package does not exist: %s", update_package);
    return 1;
  }
  ALOGI("Update package: %s", update_package);

  // Mark the inactive slot is unbootable, as it's about to get an update
  // written into it
  status = module->setSlotAsUnbootable(module, other_slot);
  if (status != 0) {
    ALOGE("Error marking slot %d as unbootable: %d", other_slot, status);
    return 1;
  }

  // Set up the environment so that a naive OTA package will write to the
  // inactive slot.  This avoids having to mess around with the OTA generation
  // code
  unlink("/dev/block/bootdevice/by-name/boot");
  unlink("/dev/block/bootdevice/by-name/system");
  status = link(slots[other_slot].boot, "/dev/block/bootdevice/by-name/boot");
  status |= link(slots[other_slot].system, "/dev/block/bootdevice/by-name/system");

  if (status != 0) {
    ALOGE("Unable to setup OTA env: %d (errno=%d)", status, errno);
    return 1;
  }

#ifdef INSTALL_PACKAGE_WIPE_CACHE_IS_INT
  int should_wipe_cache;
#else
  bool should_wipe_cache;
#endif
  status = install_package(update_package, &should_wipe_cache, "/data/last_install", false);
  if (status != INSTALL_SUCCESS) {
    ALOGE("Installation failed: %d", status);
    return 1;
  }

  status = module->setActiveBootSlot(module, other_slot);
  if (status != 0) {
    ALOGE("Error marking slot %d active: %d", other_slot, status);
    return 1;
  }

  ALOGI("Success, active boot slot is now %d", other_slot);
  return 0;
}
