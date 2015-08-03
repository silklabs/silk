LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-gc1.node
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_PATH := $(TARGET_OUT)/silk/node_modules
LOCAL_SHARED_LIBRARIES += liblog
include $(BUILD_NODE_MODULE)
