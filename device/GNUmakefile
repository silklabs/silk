# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCALGOALS += \
  emu \
  qemu \
  time \
  top10 \
  update \
  update.f \
  update.w \

include ../pub/bsp-gonk/GNUmakefile

ifneq (,$(filter $(MAKECMDGOALS),$(LOCALGOALS)))

define SETUP_ENV
  [[ -n $$SILK_BOARD ]] || SILK_BOARD=$$(readlink .repo/board); \
  [[ -n $$SILK_PRODUCT ]] || SILK_PRODUCT=$$(readlink .repo/product); \
  [[ -n $$TARGET_BUILD_VARIANT ]] || TARGET_BUILD_VARIANT=userdebug; \
  if [[ $$SILK_BOARD == base ]]; then SILK_BOARD=mako; fi; \
  if [[ $$SILK_BOARD == base.msm8909 ]]; then SILK_BOARD=pandohub; fi; \
  if [[ $$SILK_BOARD == base.kenzo ]]; then SILK_BOARD=kenzo; fi; \
  echo SILK_BOARD=$$SILK_BOARD;\
  echo SILK_PRODUCT=$$SILK_PRODUCT
endef

.PHONY: top10
top10:
	 @$(call SETUP_ENV); \
   export SILK_BOARD; \
   export SILK_PRODUCT; \
   export TARGET_BUILD_VARIANT; \
   ./list_builds 10

# Update the currently attached Mako device with the latest prebuilt dev build
.PHONY: update
update:
	set -xe; $(call SETUP_ENV); \
  mkdir -p out/prebuilt; \
  BUILD=$$SILK_BOARD-$$SILK_PRODUCT-$$BRANCH-$$TARGET_BUILD_VARIANT; \
  ( \
    cd out/prebuilt; \
    rm -rf $$BUILD/ $$BUILD.tgz; \
    wget --progress=dot:giga https://s3-us-west-2.amazonaws.com/silk-device/$(BRANCH)/latest/$$BUILD.tgz ; \
    tar zvxf $$BUILD.tgz \
  ); \
  [[ $$SILK_BOARD == qemu ]] || out/prebuilt/$$BUILD/$(or $(FLASH_SCRIPT),flash.sh) $(FLASH_ARGS)

update.f: FLASH_ARGS=-f
.PHONY: update.f
update.f: update

update.w: FLASH_ARGS=-w
.PHONY: update.w
update.w: update

# Download and run the emulator
.PHONY: qemu
qemu:
# The 'qemu' gonk represents a full emulator build and it usable directly. \
# However for all other gonks, the latest emulator build is downloaded from \
# storage.
	@if [[ $$SILK_BOARD != qemu ]]; then \
    export SILK_PRODUCT=silk; \
    export TARGET_BUILD_VARIANT=userdebug; \
    export ANDROID_PRODUCT_OUT=out/prebuilt/qemu-silk-$(BRANCH)-userdebug; \
    if [[ ! -d $$ANDROID_PRODUCT_OUT ]]; then \
      SILK_BOARD=qemu $(MAKE) --no-print-directory update; \
    fi; \
  fi; \
  exec ./run-emulator

.PHONY: emu
emu: qemu


# Set the device time
.PHONY: time
time:
	set -ex ; \
  adb root ; \
  adb wait-for-device ; \
  adb shell time_genoff $(shell date +%s)000 ; \
  set +x ; \
  echo "(sleep 2s while time updates)" ; sleep 2s ; \
  echo "Host time:   $(shell date)" ; \
  echo "Device time: $(shell adb shell date)" ; \

endif

