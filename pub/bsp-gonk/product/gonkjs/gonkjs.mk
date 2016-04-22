
PRODUCT_PACKAGES += node

# Select the device main program
SILK_DEVICE_MAIN_PATH=$(abspath $(ANDROID_BUILD_TOP)/../device-main)
PRODUCT_PACKAGES += silk-device-main

# vendor/silk/audio/
PRODUCT_PACKAGES += silk-player silk-volume

# vendor/silk/bledroid/
PRODUCT_PACKAGES += silk-bledroid-daemon

# vendor/silk/capture/
PRODUCT_PACKAGES += silk-capture

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

# vendor/silk/silk-alog/
PRODUCT_PACKAGES += silk-alog

# vendor/silk/silk-properties/
PRODUCT_PACKAGES += silk-properties

# vendor/silk/stubs/
PRODUCT_PACKAGES += fakeappops gonksched

# vendor/silk/time_genoff/
PRODUCT_PACKAGES += silk-time_genoff

# vendor/silk/wpad/
PRODUCT_PACKAGES += silk-wpad

# external/librecovery/
ENABLE_LIBRECOVERY := true
PRODUCT_PACKAGES += librecovery_test

# external/{bleno,noble}/...
PRODUCT_PACKAGES += bleno noble

