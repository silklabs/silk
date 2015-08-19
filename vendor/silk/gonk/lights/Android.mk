LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE := lights
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Wall -Werror -Wextra -Wno-unused-parameter
LOCAL_SHARED_LIBRARIES := libhardware liblog
LOCAL_32_BIT_ONLY := true
include $(BUILD_EXECUTABLE)
