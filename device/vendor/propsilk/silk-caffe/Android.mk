ifneq (,$(wildcard external/opencv3/opencv.mk))

LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := libcaffe
LOCAL_MODULE_STEM_32 := libcaffe.so
LOCAL_MODULE_STEM_64 := libcaffe.so
LOCAL_32_BIT_ONLY := true
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := SHARED_LIBRARIES
LOCAL_SRC_FILES := prebuilt/libcaffe-hardfp-openblas.so
LOCAL_MODULE_PATH := $(TARGET_OUT_SILK_SHARED_LIBRARIES)
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional

LOCAL_STATIC_LIBRARIES := \
 libopenblas \
 libgflags \
 libglog \

ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_STATIC_LIBRARIES += libprotobuf-cpp-full-gnustl-rtti
else
LOCAL_STATIC_LIBRARIES += libprotobuf-cpp-2.3.0-full-gnustl-rtti
endif

LOCAL_SHARED_LIBRARIES := \
  liblog \
  libcaffe \

include external/opencv3/opencv.mk
include $(BUILD_NODE_MODULE)

endif
