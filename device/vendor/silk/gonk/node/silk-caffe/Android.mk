LOCAL_PATH:= $(call my-dir)

# Install prebuilt libcaffe.so in the system/lib folder
# Prebuilt libraries are by default not copied to the system/lib folder
# This is a special case where we want the library to be also available on the
# device.
include $(CLEAR_VARS)
LOCAL_MODULE := libcaffe
LOCAL_INSTALLED_MODULE_STEM := libcaffe.so
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := SHARED_LIBRARIES
LOCAL_MODULE_PATH  := $(TARGET_OUT_SHARED_LIBRARIES)
LOCAL_PREBUILT_MODULE_FILE := $(TARGET_OUT_INTERMEDIATE_LIBRARIES)/libcaffe.so

# Install prebuilt libcaffe.so in TARGET_OUT_INTERMEDIATE_LIBRARIES where make
# system looks for shared libraries to resolve dependencies
$(LOCAL_PREBUILT_MODULE_FILE): LOCAL_PATH := $(LOCAL_PATH)
$(LOCAL_PREBUILT_MODULE_FILE): | $(ACP)
$(LOCAL_PREBUILT_MODULE_FILE):
	@echo "Installing libcaffe"
	$(hide) mkdir -p $(TARGET_OUT_INTERMEDIATE_LIBRARIES)
	$(hide) $(ACP) $(LOCAL_PATH)/libcaffe.so $(TARGET_OUT_INTERMEDIATE_LIBRARIES)
	$(hide) mkdir -p $(TARGET_OUT_INTERMEDIATES)/SHARED_LIBRARIES/libcaffe_intermediates
	$(hide) touch $(TARGET_OUT_INTERMEDIATES)/SHARED_LIBRARIES/libcaffe_intermediates/export_includes

include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional
LOCAL_NODE_MODULE_TYPE := file

LOCAL_STATIC_LIBRARIES := \
 libprotobuf-cpp-2.3.0-full-gnustl-rtti \
 libopenblas \
 libgflags \

LOCAL_SHARED_LIBRARIES := \
  liblog \
  libcaffe \

include external/opencv2/opencv.mk
include $(BUILD_NODE_MODULE)
