# Copyright (c) 2015 Silk Laboratories, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Laboratories, Inc.

LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_PATH  := $(TARGET_OUT)/silk
LOCAL_INSTALL_NODE_MODULES := true
LOCAL_MODULE_TAGS := eng debug
include $(BUILD_NODE_MODULE)
