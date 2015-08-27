LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_PATH  := $(TARGET_OUT)/silk
include $(BUILD_NODE_MODULE)
