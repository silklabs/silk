
PRODUCT_PACKAGES += node node_modules

SILK_CORE := \
  core.js \
  silk \

PRODUCT_PACKAGES += $(SILK_CORE)

SILK_PROGIES := \
  bledroid \
  stream-video \

PRODUCT_PACKAGES += $(SILK_PROGIES)

SILK_UI_PACKAGES := \
  bootanimation.zip \
  setup.zip \
  connecting.zip \
  online.zip \

PRODUCT_PACKAGES += $(SILK_UI_PACKAGES)
