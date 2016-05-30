LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)
LOCAL_SHARED_LIBRARIES += libcutils
include $(BUILD_NODE_MODULE)
