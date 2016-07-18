# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.ui.light=true \
  ro.silk.ui.inputevents=event0,event1 \
  ro.silk.clapper.rise.delta=25000 \
  ro.silk.clapper.min.thresh=30000 \
  ro.silk.bt.socket.scan_dur_ms=5000 \
  ro.silk.bt.socket.max_simul=1 \

# Keep the default mako build slim by excluding most extensions.  Currently
# the extensions bring the mako system.img up around 370MB, which exceeds
# the fastboot limit for .img file sizes)
SILK_FEATURE_VIDEOANALYTICS := false
SILK_FEATURE_AUDIOANALYTICS := false
SILK_FEATURE_DEMOS := false

PRODUCT_COPY_FILES += board/mako/media/logo.png:system/silk/media/logo.png
