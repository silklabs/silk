LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE := silk-dhcputil
LOCAL_MODULE_STEM := dhcputil
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Werror -Wextra
LOCAL_C_INCLUDES += system/core/include
LOCAL_SHARED_LIBRARIES := libnetutils

ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DTARGET_GE_MARSHMALLOW
endif

ifneq ($(TARGET_GE_NOUGAT),)
$(warning ========== TODO: complete N port =========)
else
include $(BUILD_SILK_EXECUTABLE)
endif
