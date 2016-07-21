# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCALGOALS += \
  demo \
  dist \
  emu \
  qemu \
  time \
  update \
  camera \
  hub \

include ../pub/bsp-gonk/GNUmakefile

ifneq (,$(filter $(MAKECMDGOALS),$(LOCALGOALS)))

# Update the currently attached Mako device with the latest prebuilt dev build
.PHONY: update
update:
	set -xe; \
  [[ -n $$SILK_BOARD ]] || SILK_BOARD=$$(readlink .repo/board); \
  [[ -n $$SILK_PRODUCT ]] || SILK_PRODUCT=$$(readlink .repo/product); \
  [[ -n $$TARGET_BUILD_VARIANT ]] || TARGET_BUILD_VARIANT=eng; \
  if [[ $$SILK_BOARD == base ]]; then SILK_BOARD=mako; fi; \
  if [[ $$SILK_BOARD == base.msm8909 ]]; then SILK_BOARD=msm8909; fi; \
  if [[ $$SILK_BOARD == base.kenzo ]]; then SILK_BOARD=kenzo; fi; \
  echo SILK_BOARD=$$SILK_BOARD;\
  echo SILK_PRODUCT=$$SILK_PRODUCT;\
  mkdir -p out/prebuilt; \
  cd out/prebuilt; \
  rm -rf $$SILK_BOARD-$$SILK_PRODUCT; \
  rm -f $$SILK_BOARD-$$SILK_PRODUCT-$$BRANCH-$$TARGET_BUILD_VARIANT; \
  wget https://s3-us-west-2.amazonaws.com/silk-device/$(BRANCH)/latest/$$SILK_BOARD-$$SILK_PRODUCT-$$BRANCH-$$TARGET_BUILD_VARIANT.tgz ; \
  tar zxf $$SILK_BOARD-$$SILK_PRODUCT-$$BRANCH-$$TARGET_BUILD_VARIANT.tgz; \
  [[ $$SILK_BOARD == qemu ]] || ./$$SILK_BOARD-$$SILK_PRODUCT/$(or $(FLASH_SCRIPT),flash.sh); \

# Download and run the emulator
.PHONY: qemu
qemu:
# The 'qemu' gonk represents a full emulator build and it usable directly. \
# However for all other gonks, the latest emulator build is downloaded from \
# storage.
	@if [[ $$SILK_BOARD != qemu ]]; then \
    export SILK_PRODUCT=silk; \
    export TARGET_BUILD_VARIANT=eng; \
    export ANDROID_PRODUCT_OUT=out/prebuilt/qemu-silk-master-eng; \
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

