ifneq (,$(wildcard external/opencv3/opencv.mk))

LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional

LOCAL_SHARED_LIBRARIES := \
  liblog \
  libcaffe \

include external/opencv3/opencv.mk
include $(BUILD_NODE_MODULE)

endif
