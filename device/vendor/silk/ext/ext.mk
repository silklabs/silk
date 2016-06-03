# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

define RENDER_EXTENSION_MK
LOCAL_PATH:=$(1)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)
endef
