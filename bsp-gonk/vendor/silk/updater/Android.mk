LOCAL_PATH := $(call my-dir)

ifeq ($(ENABLE_LIBRECOVERY),true)
include $(CLEAR_VARS)
LOCAL_MODULE := silk-updater-recovery
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := silk-updater-recovery.c
LOCAL_C_INCLUDES := external/librecovery
LOCAL_SHARED_LIBRARIES := libcutils liblog librecovery
include $(BUILD_SILK_EXECUTABLE)
endif

include $(CLEAR_VARS)
LOCAL_MODULE := silk-updater-loopback
LOCAL_MODULE_TAGS := debug eng # Do not install for -user builds
LOCAL_MODULE_STEM := silk-updater-loopback
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES := $(LOCAL_MODULE_STEM)
LOCAL_MODULE_PATH := $(TARGET_OUT_SILK_EXECUTABLES)
include $(BUILD_PREBUILT)


