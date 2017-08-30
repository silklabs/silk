LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional

LOCAL_STATIC_LIBRARIES := \
  nnpack \
  nnpack_ukernels \
  nnpack_reference \
  pthreadpool \
  cpufeatures \

LOCAL_SHARED_LIBRARIES := \
  libdl \

LOCAL_NDK_STL_VARIANT := gnustl_static
LOCAL_SDK_VERSION := 21
include $(BUILD_NODE_MODULE)
