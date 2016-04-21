LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE := silk-lights
LOCAL_MODULE_STEM := lights
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Wall -Werror -Wextra -Wno-unused-parameter
LOCAL_SHARED_LIBRARIES := libhardware liblog
include $(BUILD_SILK_EXECUTABLE)
