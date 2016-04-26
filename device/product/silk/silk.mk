# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Generic Silk platform
#

# Add branch name to ro.build.fingerprint
BUILD_VERSION_TAGS += $(BRANCH)

# inherit from gonkjs product
include product/gonkjs/gonkjs.mk
SILK_DEVICE_MAIN_PATH=# TODO: Remove this when vendor/silk/core is refactored/moved/

# Properties that are only read using getprop in sysutils.js
# should be added to vendor/silk/core/silk-props.json instead
PRODUCT_PROPERTY_OVERRIDES += \
 ro.silk.services=silk-bledroid,silk-sensors,silk-capture,silk \
 persist.silk.capture.mute=true \

# Properties only for debug builds
ifneq ($(filter $(TARGET_BUILD_VARIANT),eng userdebug),)
PRODUCT_PROPERTY_OVERRIDES += \
  persist.logd.size=16M \

# Add default IP address for eth0 (disabled by default)
# Add "persist.silk.eth0.static.enable=1" to target gonk to enable static eth0
PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.eth0.static.ip=192.168.1.199 \
  persist.silk.eth0.basemask=192.168.1.0/24 \
  persist.silk.eth0.dns.gw.ip=192.168.1.1 \

endif

# vendor/silk/core/...
SILK_CORE := \
  silk-device-main \
  silk-base-version \
  silk-core-version \
  silk-bledroid \
  silk-cv \
  silk-gc1 \
  silk-movie \
  silk-caffe \

PRODUCT_PACKAGES += $(SILK_CORE)

# vendor/silk/ext/...
SILK_EXT := \
  clapper \
  clapper-sound \
  devicemotion \
  nightlight \
  motion \
  motion-sound \
  face \
  detectface-cascade-frontalface \
  detectface-shape_predictor_68_face_landmarks \
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

# vendor/silk/gonk/...
SILK_INIT := \
  silk-props-json \

SILK_GONK_PROGIES := \
  silk-bledroid \
  silk-dash \
  libpreview \
  silk-ir \
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

# external/...
PRODUCT_PACKAGES += \
  kissfft \
  v8-profiler \
  bufferutil \
  libttspico \
  pocketsphinx \
  libttscereproc \
  libgflags \
  libprotobuf-cpp-2.3.0-full-gnustl-rtti \
  aprotoc \
  libboost \
  libopenblas \
  lib_third_party_node_webrtc_node_webrtc_gyp \
  lib_______node_webrtc_gyp \

# external/qualcomm-developer-network/...
PRODUCT_PACKAGES += \
  libQSML-0.14.0 \
  libsymphony-cpu-1.0.0 \

# packages for debug builds
ifneq ($(filter $(TARGET_BUILD_VARIANT),eng userdebug),)
PRODUCT_PACKAGES += valgrind
endif

ANDROID_TOOLCHAIN_CMAKE := $(ANDROID_BUILD_TOP)/external/android-cmake/android.toolchain.cmake

# include board-specific silk makefile if exists
-include board/$(SILK_BOARD)/silk_$(SILK_BOARD).mk
