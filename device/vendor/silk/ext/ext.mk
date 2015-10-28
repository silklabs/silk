# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

define RENDER_EXTENSION_MK
LOCAL_PATH:=$(1)
include $(CLEAR_VARS)
LOCAL_MODULE_PATH := $(TARGET_OUT)/silk/ext
LOCAL_NODE_MODULE_TYPE := file
include $(BUILD_NODE_MODULE)
endef
