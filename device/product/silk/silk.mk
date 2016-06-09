# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Generic Silk platform
#

# inherit from gonkjs product
include product/gonkjs/gonkjs.mk
SILK_DEVICE_MAIN_PATH=# TODO: Remove this when vendor/silk/core is refactored/moved/

# Properties that are only read using getprop in sysutils.js
# should be added to vendor/silk/core/silk-props.json instead
PRODUCT_PROPERTY_OVERRIDES += \
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

# Only install silk-base-version in full device builds
ifneq ($(DEFAULT_GOAL),gonk_modules)
PRODUCT_PACKAGES += silk-base-version
endif

# vendor/silk/core/...
PRODUCT_PACKAGES += \
  silk-device-core \

# vendor/propsilk/...
PRODUCT_PACKAGES += \
  silk-dialog-engine \
  silk-caffe \
  silk-cv \
  silk-gc1 \
  silk-modwatcher \
  silk-netstatus \
  silk-vad \
  silk-kws \

# vendor/silk/ext/...
SILK_EXT := \
  silkext-clapper \
  silkext-clapper-sound \
  silkext-detectcat \
  silkext-detectcat-cascade \
  silkext-detectface-cascade-frontalface \
  silkext-detectface-shape_predictor_68_face_landmarks \
  silkext-devicemotion \
  silkext-demodialog \
  silkext-dnn \
  silkext-dnn-googlenet-model \
  silkext-dnn-googlenet-proto \
  silkext-dnn-imagenet-dictionary \
  silkext-dnn-imagenet-mean \
  silkext-dnn-pedestrian-dictionary \
  silkext-dnn-pedestrian-proto \
  silkext-face \
  silkext-motion \
  silkext-motion-sound \
  silkext-nightlight \
  silkext-peddetector \
  silkext-samsungtv \
  silkext-svmsounds \
  silkext-svmsounds-babycry \
  silkext-svmsounds-clap \
  silkext-svmsounds-firealarm \
  silkext-svmsounds-glassbreak \
  silkext-welcome \
  silkext-welcome-config \

PRODUCT_PACKAGES += $(SILK_EXT)

# vendor/silk/gonk/...
SILK_INIT := \
  silk-props-json \

SILK_GONK_PROGIES := \
  silk-dash \
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
  node-webrtc \

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
