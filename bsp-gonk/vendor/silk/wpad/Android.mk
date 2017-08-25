LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE := silk-wpad
LOCAL_MODULE_STEM := wpad
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := main.cpp
ifndef ($(TARGET_GE_NOUGAT)),)
$(warning ========== TODO: Re-enable -Werror -Wextra ==========)
else
LOCAL_CFLAGS += -Werror -Wextra
endif
LOCAL_SHARED_LIBRARIES := liblog libhardware_legacy libcutils libsysutils

LOCAL_C_INCLUDES += \
    hardware/libhardware_legacy/include \
    system/core/include \

include $(BUILD_SILK_EXECUTABLE)
