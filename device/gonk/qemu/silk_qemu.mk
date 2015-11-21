# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  ro.silk.camera.width=320 \
  ro.silk.camera.height=240 \
  ro.silk.camera.fps=5 \
  ro.silk.camera.preview_scale=1 \
  ro.silk.camera.preview_skip_cnt=5 \
  ro.silk.bt.enabled=false \
  ro.silk.wifi.qemu=true

# Use the logo from Mako
PRODUCT_COPY_FILES += gonk/mako/media/logo.png:system/silk/media/logo.png

