# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.ui.inputevents=event0,event2

# Use (/system/silk) OTAs from qemu build
PRODUCT_PROPERTY_OVERRIDES += persist.silk.update.hardware=qemu

# Use the logo from Mako
PRODUCT_COPY_FILES += gonk/mako/media/logo.png:system/silk/media/logo.png

