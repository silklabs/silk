
# Exclude internal-only projects since this board is shared with partners
PRODUCT_PACKAGES := $(filter-out $(INTERNALONLY_PACKAGES),$(PRODUCT_PACKAGES))

# Enable hub-only extensions by default
PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.extensions=dialog,pandohub-ui

