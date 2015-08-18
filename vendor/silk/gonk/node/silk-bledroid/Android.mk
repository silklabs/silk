LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_NODE_MODULE_TYPE := file
LOCAL_MODULE_PATH := $(TARGET_OUT)/silk/node_modules
include $(BUILD_NODE_MODULE)
