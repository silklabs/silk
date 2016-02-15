LOCAL_PATH:= $(call my-dir)

# Install prebuilt libcaffe.so in the system/lib folder
# Prebuilt libraries are by default not copied to the system/lib folder
# This is a special case where we want the library to be also available on the
# device.
include $(CLEAR_VARS)
LOCAL_MODULE := libcaffe
LOCAL_INSTALLED_MODULE_STEM := libcaffe.so
LOCAL_32_BIT_ONLY := true
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := SHARED_LIBRARIES
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_SHARED_LIBRARIES)
ifdef TARGET_2ND_ARCH
LOCAL_PREBUILT_MODULE_FILE := $($(TARGET_2ND_ARCH_VAR_PREFIX)TARGET_OUT_INTERMEDIATE_LIBRARIES)/libcaffe.so
else
LOCAL_PREBUILT_MODULE_FILE := $(TARGET_OUT_INTERMEDIATE_LIBRARIES)/libcaffe.so
endif

ifdef TARGET_2ND_ARCH
__export_includes := $($(TARGET_2ND_ARCH_VAR_PREFIX)TARGET_OUT_INTERMEDIATES)/SHARED_LIBRARIES/libcaffe_intermediates/export_includes
else
__export_includes := $(TARGET_OUT_INTERMEDIATES)/SHARED_LIBRARIES/libcaffe_intermediates/export_includes
endif

$(__export_includes):
	$(hide) mkdir -p $(@D)
	$(hide) touch $@

# Install prebuilt libcaffe.so in TARGET_OUT_INTERMEDIATE_LIBRARIES where make
# system looks for shared libraries to resolve dependencies
$(LOCAL_PREBUILT_MODULE_FILE): LOCAL_PATH := $(LOCAL_PATH)
$(LOCAL_PREBUILT_MODULE_FILE): | $(ACP)
$(LOCAL_PREBUILT_MODULE_FILE): $(__export_includes)
	@echo "Installing libcaffe"
	$(hide) mkdir -p $(@D)
	$(hide) $(ACP) $(LOCAL_PATH)/libcaffe.so $@

include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional
LOCAL_NODE_MODULE_TYPE := file

LOCAL_STATIC_LIBRARIES := \
 libopenblas \
 libgflags \

ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_STATIC_LIBRARIES += libprotobuf-cpp-full-gnustl-rtti
else
LOCAL_STATIC_LIBRARIES += libprotobuf-cpp-2.3.0-full-gnustl-rtti
endif

LOCAL_SHARED_LIBRARIES := \
  liblog \
  libcaffe \

include external/opencv2/opencv.mk
include $(BUILD_NODE_MODULE)
