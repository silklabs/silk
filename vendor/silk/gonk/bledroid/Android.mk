LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

ifeq ($(TARGET_PRODUCT), msm8916_32)
LOCAL_CFLAGS += -DQBLUETOOTH
endif

LOCAL_MODULE := bledroid
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Wall -Wextra -Werror
LOCAL_CFLAGS += -Wno-unused-parameter
LOCAL_SHARED_LIBRARIES := liblog libhardware libsysutils
LOCAL_C_INCLUDES += hardware/libhardware/include
LOCAL_MODULE_TAGS := optional
LOCAL_REQUIRED_MODULES := bluetooth.default
LOCAL_32_BIT_ONLY := true
include $(BUILD_EXECUTABLE)
