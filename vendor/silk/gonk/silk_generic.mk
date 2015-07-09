#
# Generic Silk platform
#

PRODUCT_PACKAGES += node node_modules

SILK_CORE := \
  core.js \
  init.silk.rc \
  silk \

PRODUCT_PACKAGES += $(SILK_CORE)

SILK_PROGIES := \
  bledroid \
  dhcputil \
  capture \
  wpa_monitor \

PRODUCT_PACKAGES += $(SILK_PROGIES)

SILK_UI_PACKAGES := \
  bootanimation.zip \
  connecting.zip \
  online.zip \
  powerdown.zip \
  setup.zip \

PRODUCT_PACKAGES += $(SILK_UI_PACKAGES)

ENABLE_LIBRECOVERY := true
PRODUCT_PACKAGES += librecovery librecovery_test

# gonk stubs
PRODUCT_PACKAGES += fakeappops gonksched

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.update.manifest_url=https://silk-device.s3.amazonaws.com/master/latest/ota.json \
  ro.silk.update.poll_hours=24
