# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.notif_light.enabled=true \
  ro.silk.ui.inputevents=event0,event6,event7 \

PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.update.hardware=kenzo

PRODUCT_COPY_FILES += board/mako/media/logo.png:system/silk/media/logo.png

# Exclude internal-only projects since this board is shared with partners
PRODUCT_PACKAGES := $(filter-out $(INTERNALONLY_PACKAGES),$(PRODUCT_PACKAGES))
