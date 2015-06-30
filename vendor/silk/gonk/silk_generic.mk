#
# Generic Silk platform
#

PRODUCT_PACKAGES += node node_modules

SILK_CORE := \
  core.js \
  silk \

PRODUCT_PACKAGES += $(SILK_CORE)

SILK_PROGIES := \
  bledroid \
  stream-video \
  wpa_monitor \

PRODUCT_PACKAGES += $(SILK_PROGIES)

SILK_UI_PACKAGES := \
  bootanimation.zip \
  setup.zip \
  connecting.zip \
  online.zip \

PRODUCT_PACKAGES += $(SILK_UI_PACKAGES)

ENABLE_LIBRECOVERY := true
PRODUCT_PACKAGES += librecovery librecovery_test
