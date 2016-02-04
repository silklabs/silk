LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional
LOCAL_NODE_MODULE_TYPE := file
include external/opencv2/opencv.mk
include $(BUILD_NODE_MODULE)
