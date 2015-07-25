#
# Generic Silk platform
#

NODE_ENGINE?=node
PRODUCT_PACKAGES += $(NODE_ENGINE)

SILK_CORE := \
  core.js \
  init.silk.rc \
  base_version.js \
  silk \

PRODUCT_PACKAGES += $(SILK_CORE)

SILK_PROGIES := \
  bledroid \
  capture \
  dhcputil \
  lights \
  player \
  volume \
  wpad \
  silk-sensors \

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
  persist.silk.debug=silk-*,-silk-*:debug \
  persist.silk.debug.colors=true \
  ro.silk.update.manifest_url=https://silk-device.s3.amazonaws.com/master/latest/ota.json \
  ro.silk.update.poll_hours=3
