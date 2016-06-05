# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCALGOALS += \
  demo \
  dist \
  emu \
  fut \
  qemu \
  time \
  update \

include ../pub/bsp-gonk/GNUmakefile

ifneq (,$(filter $(MAKECMDGOALS),$(LOCALGOALS)))

# Update the currently attached Mako device with the latest prebuilt dev build
.PHONY: update
update:
	set -xe; \
  [[ -n $$SILK_BOARD ]] || SILK_BOARD=$$(readlink .repo/board); \
  if [[ $$SILK_BOARD == base ]]; then SILK_BOARD=mako; fi; \
  echo SILK_BOARD=$$SILK_BOARD; \
  rm -rf out/prebuilt/$$SILK_BOARD; \
  mkdir -p out/prebuilt/$$SILK_BOARD; \
  cd out/prebuilt/$$SILK_BOARD; \
  wget https://s3-us-west-2.amazonaws.com/silk-device/$(BRANCH)/latest/$$SILK_BOARD.tgz ; \
  tar zxf $$SILK_BOARD.tgz; \
  [[ $$SILK_BOARD == qemu ]] || ./*/$(or $(FLASH_SCRIPT),flash.sh); \

# Update the currently attached Mako device with the latest prebuilt FUT build
.PHONY: fut
fut: FLASH_SCRIPT=flash_fut.sh
fut: update

# Update the currently attached Mako device with the latest prebuilt demo build
.PHONY: demo
demo: FLASH_SCRIPT=flash_demo.sh
demo: update

# Download and run the emulator
.PHONY: qemu
qemu:
# The 'qemu' gonk represents a full emulator build and it usable directly. \
# However for all other gonks, the latest emulator build is downloaded from \
# storage.
	@if [[ $$SILK_BOARD != qemu ]]; then \
    export ANDROID_PRODUCT_OUT=out/prebuilt/qemu/aosp_arm; \
    if [[ ! -d $$ANDROID_PRODUCT_OUT ]]; then \
      SILK_BOARD=qemu $(MAKE) --no-print-directory update; \
    fi; \
  fi; \
  exec ./run-emulator

.PHONY: emu
emu: qemu


# Builds a distribution archive from the current build products
.PHONY: dist
dist: | .repo/manifest.xml
	$(call ENVSETUP,clean) # <-- drop all local patches before archiving
	$(call ENVSETUP,np) && ./travis/build_device_archive.sh $(TARGET_PRODUCT)-$(shell date +%F_%H%M%S) dist

# Set the device time
.PHONY: time
time:
	@+$(ENVSETUP) ; \
  set -ex ; \
  adb root ; \
  adb wait-for-device ; \
  adb shell time_genoff $(shell date +%s)000 ; \
  set +x ; \
  echo "(sleep 2s while time updates)" ; sleep 2s ; \
  echo "Host time:   $(shell date)" ; \
  echo "Device time: $(shell adb shell date)" ; \

endif

