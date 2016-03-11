# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Generic Silk platform
#

# Add branch name to ro.build.fingerprint
BUILD_VERSION_TAGS += $(BRANCH)

# Properties that are only read using getprop in sysutils.js
# should be added to vendor/silk/gonk/init/silk-props.json instead
PRODUCT_PROPERTY_OVERRIDES += \
 ro.silk.services=bledroid,silk-sensors,capture,silk \
 persist.silk.capture.dash=true \
 persist.silk.capture.mute=true \

# Properties only for debug builds
ifneq ($(filter $(TARGET_BUILD_VARIANT),eng userdebug),)
PRODUCT_PROPERTY_OVERRIDES += \
  persist.logd.size=16M \

endif

PRODUCT_PACKAGES += node

# vendor/silk/core/...
SILK_CORE := \
  core \
  silk-base-version \
  silk-core-version \
  silk-alog \
  silk-bledroid \
  silk-cv \
  silk-gc1 \
  silk-movie \
  silk-properties \
  silk-caffe \

PRODUCT_PACKAGES += $(SILK_CORE)

# vendor/silk/ext/...
SILK_EXT := \
  clapper \
  clapper-sound \
  nightlight \
  motion \
  motion-sound \
  face \
  detectface-cascade-frontalface \
  detectface-cascade-eye \
  detectface-cascade-eyeglasses \
  detectcat-cascade \
  detectcat \
  oksilk \
  oksilk-pocketsphinx-dict \
  oksilk-pocketsphinx-grammar \
  oksilk-hotkeyword-sound \
  dnn \
  dnn-googlenet-model \
  dnn-googlenet-proto \
  dnn-imagenet-mean \
  dnn-imagenet-dictionary \
  samsungtv \
  svmsounds \
  svmsounds-clap \
  svmsounds-firealarm \
  svmsounds-glassbreak \
  welcome \
  welcome-config \
  peddetector \
  dnn-pedestrian-proto \
  dnn-pedestrian-dictionary \

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
  silk-debug-wrapper \
  silk-props.json \

SILK_GONK_PROGIES := \
  silk-bledroid \
  silk-capture \
  libpreview \
  silk-dhcputil \
  silk-ir \
  silk-lights \
  silk-player \
  silk-volume \
  silk-wpad \
  silk-sensors \
  silk-time_genoff \
  silk-tts \
  tts-cereproc-heather-license \
  tts-cereproc-heather-voice \

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
PRODUCT_PACKAGES += librecovery_test

# gonk stubs
PRODUCT_PACKAGES += fakeappops gonksched

# external/...
PRODUCT_PACKAGES += \
  bleno \
  noble \
  opencv \
  kissfft \
  v8-profiler \
  libttspico \
  pocketsphinx \
  libttscereproc \
  libwebrtc \
  libgflags \
  libprotobuf-cpp-2.3.0-full-gnustl-rtti \
  aprotoc \
  libboost \
  libopenblas \

# packages for debug builds
ifneq ($(filter $(TARGET_BUILD_VARIANT),eng userdebug),)
PRODUCT_PACKAGES += valgrind
endif

# include platform-specific silk makefile, if exists
-include gonk/${GONK}/silk_${GONK}.mk
