LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DTARGET_GE_MARSHMALLOW
else
ifeq ($(TARGET_USES_QCOM_BSP), true)
LOCAL_CFLAGS += -DQBLUETOOTH_L
endif
endif

ifeq ($(TARGET_QBLUETOOTH_HCI_CMD_SEND),true)
LOCAL_CFLAGS += -DQBLUETOOTH_HCI_CMD_SEND
endif

ifeq ($(TARGET_AOSPBLUETOOTH_SUPPORTS_GUEST_MODE),true)
LOCAL_CFLAGS += -DAOSPBLUETOOTH_SUPPORTS_GUEST_MODE
endif

ifneq ($(TARGET_NO_BLUETOOTH_GATT_SERVER_MTU_CHANGED_CALLBACK),true)
LOCAL_CFLAGS += -DBLUETOOTH_GATT_SERVER_MTU_CHANGED_CALLBACK
endif

LOCAL_MODULE := silk-bledroid-daemon
LOCAL_MODULE_STEM := bledroid
LOCAL_SRC_FILES := main.cpp
LOCAL_CFLAGS += -Wall -Wextra -Werror -Wno-unused-parameter
LOCAL_SHARED_LIBRARIES := \
  libcutils \
  liblog \
  libhardware \
  libhardware_legacy \
  libsysutils
LOCAL_C_INCLUDES += hardware/libhardware/include
LOCAL_MODULE_TAGS := optional
LOCAL_REQUIRED_MODULES := bluetooth.default

-include external/stlport/libstlport.mk
LOCAL_CFLAGS += -std=c++11

include $(BUILD_SILK_EXECUTABLE)
