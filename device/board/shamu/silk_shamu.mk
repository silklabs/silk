# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.ui.inputevents=event1,event2

# Use the logo from Mako
PRODUCT_COPY_FILES += board/mako/media/logo.png:system/silk/media/logo.png

