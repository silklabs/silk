
# Exclude cereproc since this board is shared with partners
SILK_FEATURE_TTS_CEREPROC := false

# Enable hub-only extensions by default
PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.extensions=dialog,pandohub-ui,svmsounds

