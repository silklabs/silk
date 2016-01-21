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
  ro.silk.bt.socket.scan_dur_sec=5 \
  ro.silk.bt.socket.max_simul=1 \

PRODUCT_COPY_FILES += gonk/mako/media/logo.png:system/silk/media/logo.png
