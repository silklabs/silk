# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

-include ../version/branch
BRANCH ?= unknown
export BRANCH

LOCALGOALS += \
  update \
  fut \
  demo \
  qemu \
  emu \
  dist \

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
  [[ $$SILK_BOARD == qemu ]] || ./aosp_$$SILK_BOARD/$(or $(FLASH_SCRIPT),flash.sh); \

# Update the currently attached Mako device with the latest prebuilt FUT build
.PHONY: fut
fut: FLASH_SCRIPT=flash_fut.sh
fut: update

# Update the currently attached Mako device with the latest prebuilt demo build
.PHONY: demo
demo: FLASH_SCRIPT=flash_demo.sh
demo: update

# Run the emulator
EMULATOR=emulator -verbose -show-kernel $(EXTRA_EMULATOR_OPTS)
.PHONY: qemu
qemu:
# The 'qemu' gonk represents a full emulator build and it usable directly. \
# However for all other gonks, the latest emulator build is downloaded from \
# storage.
	@if [[ $$SILK_BOARD != qemu ]]; then \
    $(MAKE) --no-print-directory update.qemu; \
    export ANDROID_PRODUCT_OUT=out/prebuilt/qemu/aosp_arm; \
  fi; \
  exec ./run-emulator

.PHONY: emu
emu: qemu


# Builds a distribution archive from the current build products
.PHONY: dist
dist: | .repo/manifest.xml
	$(call ENVSETUP,clean) # <-- drop all local patches before archiving
	$(call ENVSETUP,np) && ./travis/build_device_archive.sh $(TARGET_PRODUCT)-$(shell date +%F_%H%M%S) dist

# Manipulate the silk service on device:
#
#  make silk-start
#  make silk-stop
#  make silk-restart
silk_service_targets := $(addprefix silk-, start stop restart)
.PHONY: $(silk_service_targets)
$(silk_service_targets):
	$(ENVSETUP) && \
  adb root && \
  adb wait-for-device && \
  adb shell setprop ctl.$(subst silk-,,$@) silk


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

