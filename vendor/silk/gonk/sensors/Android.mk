LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := silk-sensors
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Wall -Wextra -Werror
LOCAL_CFLAGS += -Wno-unused-parameter
LOCAL_CFLAGS += -std=c++11
LOCAL_SHARED_LIBRARIES := liblog libhardware libsysutils
LOCAL_C_INCLUDES += hardware/libhardware/include
LOCAL_MODULE_TAGS := optional

include $(BUILD_EXECUTABLE)
