LOCAL_PATH := $(call my-dir)

ifeq ($(ENABLE_LIBRECOVERY),true)

include $(CLEAR_VARS)
LOCAL_MODULE := silk-updater
LOCAL_SRC_FILES := main.c
LOCAL_C_INCLUDES := external/librecovery
LOCAL_SHARED_LIBRARIES := libcutils liblog librecovery
include $(BUILD_SILK_EXECUTABLE)

endif
