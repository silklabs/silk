#
# Generic Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.debug=silk-*,-silk-*:debug \
  persist.silk.debug.colors=true \
  ro.silk.services=bledroid,silk-sensors,capture,mic,silk \
  ro.silk.update.manifest_url=https://silk-device.s3.amazonaws.com/master/latest/ota.json \
  ro.silk.update.poll_hours=3

NODE_ENGINE?=node
PRODUCT_PACKAGES += $(NODE_ENGINE)

# vendor/silk/core/...
SILK_CORE := \
  core \
  base_version.js \
  silk-alog \
  silk-gc1 \
  silk-movie \

PRODUCT_PACKAGES += $(SILK_CORE)

# vendor/silk/ext/...
SILK_EXT := \
  detectobject \
  detectobject-cascade-frontalface \
  detectobject-cascade-cars \
  example \
  nightlight \

PRODUCT_PACKAGES += $(SILK_EXT)

# vendor/silk/gonk/...
SILK_INIT := \
  init.silk.rc \
  silk-service \
  silk-dashboard \

SILK_GONK_PROGIES := \
  bledroid \
  capture \
  dhcputil \
  lights \
  mic \
  player \
  volume \
  wpad \
  silk-sensors \

SILK_UI_PACKAGES := \
  logo.png \
  bootanimation.zip \
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
  opencv \
  kissfft \

