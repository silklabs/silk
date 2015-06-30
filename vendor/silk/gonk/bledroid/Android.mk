LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := bledroid
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Wall -Wextra -Werror
LOCAL_CFLAGS += -Wno-unused-parameter
LOCAL_SHARED_LIBRARIES := liblog libhardware

LOCAL_C_INCLUDES += hardware/libhardware/include

LOCAL_MODULE_TAGS := optional
include $(BUILD_EXECUTABLE)

