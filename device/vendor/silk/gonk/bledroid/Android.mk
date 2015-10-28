LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

ifeq ($(TARGET_USES_QCOM_BSP), true)
  LOCAL_CFLAGS += -DQBLUETOOTH
endif

LOCAL_MODULE := bledroid
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Wall -Wextra -Werror -Wno-unused-parameter
LOCAL_SHARED_LIBRARIES := \
  liblog \
  libhardware \
  libhardware_legacy \
  libsysutils
LOCAL_C_INCLUDES += hardware/libhardware/include
LOCAL_MODULE_TAGS := optional
LOCAL_REQUIRED_MODULES := bluetooth.default

include external/stlport/libstlport.mk
LOCAL_CFLAGS += -std=c++11

include $(BUILD_SILK_EXECUTABLE)
