LOCAL_PATH:= $(call my-dir)

# Install prebuilt libcaffe.so in the system/lib folder
# Libraries in prebuilts folder by default aren't copied to the system/lib folder
# and are available only to make linker happy. This is a special case where
# we want the library to be also available on the device.
include $(CLEAR_VARS)
LOCAL_MODULE := libcaffe
LOCAL_INSTALLED_MODULE_STEM := libcaffe.so
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := SHARED_LIBRARIES
LOCAL_MODULE_PATH  := $(TARGET_OUT_SHARED_LIBRARIES)
LOCAL_PREBUILT_MODULE_FILE := $(ANDROID_BUILD_TOP)/prebuilts/device/base/silk_arm/libcaffe.so
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional
LOCAL_NODE_MODULE_TYPE := file

LOCAL_SHARED_LIBRARIES := \
  liblog \
  libcaffe \

include external/opencv2/opencv.mk

include $(BUILD_NODE_MODULE)
