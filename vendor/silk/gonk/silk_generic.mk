# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Generic Silk platform
#

# Add branch name to ro.build.fingerprint
BUILD_VERSION_TAGS += $(BRANCH)

PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.debug=silk-*,-silk-*:debug \
  persist.silk.debug.colors=true \
  persist.silk.ranger.enabled=false \
  ro.silk.services=bledroid,silk-sensors,capture,silk \
  ro.silk.update.manifest_url=https://silk-device.s3.amazonaws.com/{channel}/latest/{device}_ota.json \
  ro.silk.update.poll_hours=3 \

# Properties only for debug builds
ifneq ($(filter $(TARGET_BUILD_VARIANT),eng userdebug),)
PRODUCT_PROPERTY_OVERRIDES += \
  persist.logd.size=16M \

endif


NODE_ENGINE?=node
PRODUCT_PACKAGES += $(NODE_ENGINE)

# vendor/silk/core/...
SILK_CORE := \
  core \
  base_version.js \
  silk-alog \
  silk-bledroid \
  silk-gc1 \
  silk-movie \

PRODUCT_PACKAGES += $(SILK_CORE)

# vendor/silk/ext/...
SILK_EXT := \
  detectobject \
  detectobject-cascade-cars \
  clapper \
  clapper-sound \
  nightlight \
  trackobject \
  trackobject-sound \
  detectface \
  detectface-cascade-frontalface \
  knockknock \

PRODUCT_PACKAGES += $(SILK_EXT)

# external/opencv2
OPENCV_PACKAGES := \
  opencv_createsamples \
  opencv_traincascade

PRODUCT_PACKAGES += $(OPENCV_PACKAGES)

# vendor/silk/gonk/...
SILK_INIT := \
  init.silk.rc \
  silk-kmsg \
  silk-service \
  silk-dashboard \

SILK_GONK_PROGIES := \
  bledroid \
  capture \
  libnative_camera_capture \
  dhcputil \
  lights \
  player \
  volume \
  wpad \
  silk-sensors \

SILK_UI_PACKAGES := \
  logo.png \
  bootanimation.zip \
  charging.zip \
  connecting.zip \
  online.zip \
  powerdown.zip \
  setup.zip \

PRODUCT_PACKAGES += $(SILK_INIT)
PRODUCT_PACKAGES += $(SILK_GONK_PROGIES)
PRODUCT_PACKAGES += $(SILK_UI_PACKAGES)

ENABLE_LIBRECOVERY := true
PRODUCT_PACKAGES += librecovery librecovery_test

# gonk stubs
PRODUCT_PACKAGES += fakeappops gonksched

# external/...
PRODUCT_PACKAGES += \
  bleno \
  noble \
  opencv \
  kissfft \

# include platform-specific silk makefile, if exists
-include gonk/${GONK}/silk_${GONK}.mk

