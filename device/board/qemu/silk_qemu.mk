# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Product specific Makefile for the Silk platform
#

PRODUCT_PROPERTY_OVERRIDES += \
  persist.silk.vidupload.enabled=false \
  persist.silk.crashrprt.enabled=false \
  persist.silk.wifi.stub=true \
  ro.silk.camera.width=320 \
  ro.silk.camera.height=240 \
  ro.silk.camera.fps=5 \
  ro.silk.camera.preview_scale=1 \
  ro.silk.camera.preview_skip_cnt=5 \
  ro.silk.bt.hw.enabled=false \
  ro.silk.audio.hw.enabled=false \


# NNPACK requires NEON to compile but NEON support is
# not enabled for qemu
SILK_FEATURE_NNPACK := false

# Use the logo from Mako
PRODUCT_COPY_FILES += board/mako/media/logo.png:system/silk/media/logo.png

