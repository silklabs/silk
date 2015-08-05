LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_PATH := $(TARGET_OUT)/silk/node_modules
LOCAL_NODE_MODULE_TYPE := file
LOCAL_SHARED_LIBRARIES += liblog
include $(BUILD_NODE_MODULE)
