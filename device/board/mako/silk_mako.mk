# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.notif_light.enabled=true \
  ro.silk.ui.inputevents=event0,event1 \
  ro.silk.clapper.rise.delta=25000 \
  ro.silk.clapper.min.thresh=30000 \
  ro.silk.bt.socket.scan_dur_ms=5000 \
  ro.silk.bt.socket.max_simul=1 \

# Keep the default mako build slim by excluding all extensions.  Currently
# /system/silk/ext/ brings the mako system.img up around 370MB, which exceeds
# the fastboot limit for .img file sizes)
PRODUCT_PACKAGES := $(filter-out $(SILK_EXT),$(PRODUCT_PACKAGES))

PRODUCT_COPY_FILES += board/mako/media/logo.png:system/silk/media/logo.png
