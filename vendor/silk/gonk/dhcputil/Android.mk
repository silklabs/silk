LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE := dhcputil
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Werror -Wextra
LOCAL_C_INCLUDES += system/core/include
LOCAL_SHARED_LIBRARIES := libnetutils

include $(BUILD_EXECUTABLE)
