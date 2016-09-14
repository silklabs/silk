# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Generic Silk platform
#

# include board-specific silk makefile if exists
-include board/$(SILK_BOARD)/silk_$(SILK_BOARD).mk

# TODO: Disable dialog by default until kws can co-exist with DNN
SILK_FEATURE_DIALOG ?= false

# inherit from gonkjs product
include product/gonkjs/gonkjs.mk
SILK_DEVICE_MAIN_PATH=# TODO: Remove this when vendor/silk/core is refactored/moved/

# System properties that can be updated by a silkota
#
# Note: silk-debug-prop is not added to PRODUCT_PACKAGES here as it should only
#      be present in userdebug or eng ubilds
TARGET_SYSTEM_PROP = $(wildcard $(TARGET_DEVICE_DIR)/system.prop) \
                     product/silk/import.prop
PRODUCT_PACKAGES += silk-build-prop

# Only install silk-bsp-version in full builds
ifneq ($(DEFAULT_GOAL),gonk_modules)
PRODUCT_PACKAGES += silk-bsp-version
else
# But sneak silk-debug-prop into base builds since they're always debug by
# definition
PRODUCT_PACKAGES += silk-debug-prop
endif

# vendor/silk/core/...
PRODUCT_PACKAGES += \
  silk-device-core \
  logo.png \

# vendor/propsilk/...
PRODUCT_PACKAGES += \
  silk-ab-updater \
  silk-caffe \
  silk-cv \
  silk-device-api \
  silk-device-ui \
  silk-factory-reset \
  silk-gc1 \
  silk-gonk-version \
  silk-audio-dnn \
  silk-lifx \
  silk-modwatcher \
  silk-netstatus \
  silk-outbox \
  silk-say \
  silk-sonos \
  silk-stt \
  silk-tts \
  silk-update \
  silk-vad \

ifneq ($(strip $(SILK_FEATURE_DIALOG)),false)
PRODUCT_PACKAGES += \
  silk-dialog-engine \
  silk-dialog-script \
  silk-dialog-storage \

endif

# Extensions that are alway wanted for debug builds but should never ship in a
# commercial product.
ifneq ($(filter $(TARGET_BUILD_VARIANT),eng userdebug),)
PRODUCT_PACKAGES += \
  silkext-voicerecorder \

endif

# Extensions for video analytics
ifneq ($(strip $(SILK_FEATURE_VIDEOANALYTICS)),false)
PRODUCT_PACKAGES += \
  silkext-detectface-cascade-frontalface \
  silkext-detectface-shape_predictor_68_face_landmarks \
  silkext-dnn \
  silkext-dnn-googlenet-model \
  silkext-dnn-googlenet-proto \
  silkext-dnn-imagenet-dictionary \
  silkext-dnn-imagenet-mean \
  silkext-dnn-pedestrian-dictionary \
  silkext-dnn-pedestrian-proto \
  silkext-face \
  silkext-motion \

endif

# Demo extensions.
ifneq ($(strip $(SILK_FEATURE_DEMOS)),false)
PRODUCT_PACKAGES += \
  silkext-clapper \
  silkext-clapper-sound \
  silkext-devicemotion \
  silkext-nightlight \
  silkext-peddetector \
  silkext-welcome \
  silkext-welcome-config \

endif

# Dialog/Hub extensions
ifneq ($(strip $(SILK_FEATURE_DIALOG)),false)
PRODUCT_PACKAGES += \
  silkext-dialog \
  silkext-pandohub-ui \

endif

# Extensions for SVM based audio analytics
ifneq ($(strip $(SILK_FEATURE_SVM_AUDIOANALYTICS)),false)
PRODUCT_PACKAGES += \
  silkext-svmsounds \
  silkext-svmsounds-babycry \
  silkext-svmsounds-clap \
  silkext-svmsounds-firealarm \
  silkext-svmsounds-glassbreak \

endif

# vendor/silk/propgonk/...
PRODUCT_PACKAGES += \
  silk-dash \
  silk-ir \
  silk-tts-native \

ifneq ($(strip $(SILK_FEATURE_UI_MOVIES)),false)
PRODUCT_PACKAGES += \
  logo.png \
  bootanimation.zip \
  charging.zip \
  connecting.zip \
  online.zip \
  powerdown.zip \
  setup.zip \

endif

# external/...
PRODUCT_PACKAGES += \
  kissfft \
  v8-profiler \
  bufferutil \
  libttspico \
  pocketsphinx \
  libgflags \
  libprotobuf-cpp-2.3.0-full-gnustl-rtti \
  aprotoc \
  libboost \
  libopenblas \
  libsodium \
  sodium \
  libglog \

ifneq ($(strip $(SILK_FEATURE_TTS_CEREPROC)),false)
# cereproc is internal-only, we don't have a license to distribute
PRODUCT_PACKAGES += \
  tts-cereproc-heather-license \
  tts-cereproc-heather-voice \
  libttscereproc \

PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.say.lib=ttscereproc \

endif

# Ugly gyp-generated package name for /node-webrtc
PRODUCT_PACKAGES += \
  lib__________node_webrtc_node_webrtc_gyp \

ifneq ($(strip $(SILK_FEATURE_QDN)),false)
# external/qualcomm-developer-network/...
PRODUCT_PACKAGES += \
  libQSML-0.14.0 \
  libsymphony-cpu-1.0.0 \

endif

# packages for debug builds
ifneq ($(filter $(TARGET_BUILD_VARIANT),eng userdebug),)
PRODUCT_PACKAGES += valgrind
endif

ANDROID_TOOLCHAIN_CMAKE := $(ANDROID_BUILD_TOP)/external/android-cmake/android.toolchain.cmake

