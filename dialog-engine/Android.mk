LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)

LOCAL_PATH:=$(realpath $(ANDROID_BUILD_TOP)/../dialog-script)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)
