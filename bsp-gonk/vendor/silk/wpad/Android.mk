LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE := silk-wpad
LOCAL_MODULE_STEM := wpad
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Werror -Wextra
LOCAL_SHARED_LIBRARIES := liblog libhardware_legacy libcutils libsysutils

LOCAL_C_INCLUDES += \
    hardware/libhardware_legacy/include \
    system/core/include \

include $(BUILD_SILK_EXECUTABLE)
