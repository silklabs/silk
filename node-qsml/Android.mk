LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional

LOCAL_SHARED_LIBRARIES := \
  libQSML-0.15.0 \
  libsymphony-cpu-1.1.0 \

LOCAL_NDK_STL_VARIANT := gnustl_static
LOCAL_SDK_VERSION := 19
include $(BUILD_NODE_MODULE)
