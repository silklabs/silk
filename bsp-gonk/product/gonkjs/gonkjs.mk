#
# Base device environment
#
this_mkfile_dir := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))

# Build properties
PRODUCT_PROPERTY_OVERRIDES += \
 ro.silk.build.product=$(SILK_PRODUCT) \
 ro.silk.build.board=$(SILK_BOARD) \

# Services to start/stop with |adb shell start| and |adb shell stop|
PRODUCT_PROPERTY_OVERRIDES += \
 ro.silk.services=silk-bledroid,silk-sensors,silk-capture,silk \

# 'import.prop' gets built into /system/build.prop, making it easier to add
# silk-specific system properties without having to deal with manipulating
# /system/build.prop
TARGET_SYSTEM_PROP = $(wildcard $(TARGET_DEVICE_DIR)/system.prop) \
                     product/gonkjs/import.prop

# Volume defaults
PRODUCT_PROPERTY_OVERRIDES += \
 persist.silk.volume.level=75 \
 persist.silk.volume.mute=false \

PRODUCT_PACKAGES += node

# Select the device main program
SILK_DEVICE_MAIN_PATH := $(abspath $(this_mkfile_dir)/../../../device-main)
PRODUCT_PACKAGES += silk-device-main

# vendor/silk/bledroid/
PRODUCT_PACKAGES += silk-bledroid-daemon

# vendor/silk/bootctl/
PRODUCT_PACKAGES += bootctl

# vendor/silk/capture/
PRODUCT_PACKAGES += silk-capture-daemon \
  libpreview \
  libsilkSimpleH264Encoder \
  silk-capture-mic \
  silk-mic \

# vendor/silk/dhcputil/
PRODUCT_PACKAGES += silk-dhcputil

# vendor/silk/init/
PRODUCT_PACKAGES += \
  init.silk.rc \
  silk-kmsg \
  silk-init \
  silk-init-js \
  silk-debug-wrapper \

# vendor/silk/lights/
PRODUCT_PACKAGES += silk-lights

# vendor/silk/sensors/
PRODUCT_PACKAGES += silk-sensors

# vendor/silk/silk-log/
PRODUCT_PACKAGES += silk-log

# vendor/silk/silk-alog/
PRODUCT_PACKAGES += silk-alog

# vendor/silk/silk-bledroid
PRODUCT_PACKAGES += silk-bledroid

# vendor/silk/silk-camera
PRODUCT_PACKAGES += silk-camera

# vendor/silk/silk-capture
PRODUCT_PACKAGES += silk-capture

# vendor/silk/silk-core-version
PRODUCT_PACKAGES += silk-core-version

# vendor/silk/silk-input/
PRODUCT_PACKAGES += silk-input

# vendor/silk/silk-movie/
PRODUCT_PACKAGES += silk-movie

# vendor/silk/silk-ntp/
PRODUCT_PACKAGES += silk-ntp

# vendor/silk/player/
PRODUCT_PACKAGES += silk-player

# vendor/silk/silk-properties/
PRODUCT_PACKAGES += silk-properties

# vendor/silk/stubs/
PRODUCT_PACKAGES += fakeappops fakeperm gonksched

# vendor/silk/time_genoff/
PRODUCT_PACKAGES += silk-time_genoff

# vendor/silk/volume/
PRODUCT_PACKAGES += silk-volume

# vendor/silk/wpad/
PRODUCT_PACKAGES += silk-wpad

# vendor/silk/silk-sysutils
PRODUCT_PACKAGES += silk-sysutils

# vendor/silk/silk-vibrator
PRODUCT_PACKAGES += silk-vibrator

# vendor/silk/silk-volume
PRODUCT_PACKAGES += silk-volume

# vendor/silk/silk-wifi
PRODUCT_PACKAGES += silk-wifi

# vendor/silk/silk-battery
PRODUCT_PACKAGES += silk-battery

# vendor/silk/silk-lights
PRODUCT_PACKAGES += silk-lights

# vendor/silk/silk-sensors
PRODUCT_PACKAGES += silk-sensors

# external/librecovery/
ENABLE_LIBRECOVERY := true
PRODUCT_PACKAGES += librecovery_test

# external/{bleno,noble}/
PRODUCT_PACKAGES += bleno noble

# external/i2c-tools
PRODUCT_PACKAGES += i2cdetect i2cdump i2cget i2cget

# external/node-lame/
PRODUCT_PACKAGES += lame

# external/node-opencv/
PRODUCT_PACKAGES += opencv

# vendor/silk/silk-speaker
PRODUCT_PACKAGES += silk-speaker

# vendor/silk/silk-audioplayer
PRODUCT_PACKAGES += silk-audioplayer

# vendor/silk/node-wav
PRODUCT_PACKAGES += node-wav

# include board-specific makefile if it exists
-include board/$(SILK_BOARD)/$(SILK_BOARD).mk
