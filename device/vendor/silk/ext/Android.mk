# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCAL_PATH := $(call my-dir)

# TODO: Remove this |if| when vendor/silk/core is refactored/moved
ifeq ($(strip $(SILK_DEVICE_MAIN_PATH)),)

EXT_ANDROID_MKS := $(call all-makefiles-under,$(LOCAL_PATH))
include $(LOCAL_PATH)/ext.mk

# Build a virtual Android.mk for all the package.json files within this
# directory
$(foreach ext,$(dir $(wildcard $(LOCAL_PATH)/*/package.json)), \
  $(eval $(call RENDER_EXTENSION_MK,$(ext))) \
 )

ifeq ($(ONE_SHOT_MAKEFILE),)
# Permit extensions to include an optional Android.mk (not needed normally)
include $(EXT_ANDROID_MKS)
endif

else
$(warning Not using vendor/silk/ext)
endif
