# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

ifndef LOCAL_32_BIT_ONLY
LOCAL_32_BIT_ONLY := true
endif

ifndef LOCAL_MODULE_PATH
LOCAL_MODULE_PATH := $(TARGET_OUT_SILK_SHARED_LIBRARIES)
endif

include $(BUILD_SHARED_LIBRARY)
