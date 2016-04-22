LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_NODE_MODULE_TYPE := file
LOCAL_SHARED_LIBRARIES += libcutils
include $(BUILD_NODE_MODULE)
