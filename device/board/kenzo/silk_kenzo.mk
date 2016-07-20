# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.ui.light=true \
  ro.silk.ui.inputevents=event0,event6,event7 \

PRODUCT_COPY_FILES += board/mako/media/logo.png:system/silk/media/logo.png

# Little hacky.  silkhub.mk will disabled movies, but for kenzo it's nice to
# have them since kenzo has a display so re-enable.
SILK_FEATURE_UI_MOVIES := true

# Exclude cereproc since this board is shared with partners
SILK_FEATURE_TTS_CEREPROC := false

