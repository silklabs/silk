LOCAL_PATH := $(call my-dir)
JSONCPP_PATH := vendor/silk/gonk/jsoncpp

include $(CLEAR_VARS)
LOCAL_MODULE := silk-sensors
LOCAL_SRC_FILES := ../jsoncpp/jsoncpp.cpp main.cpp
LOCAL_CFLAGS += -Wall -Wextra
LOCAL_CFLAGS += -Wno-unused-parameter
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0
LOCAL_SHARED_LIBRARIES := liblog libhardware libsysutils
LOCAL_C_INCLUDES += hardware/libhardware/include
LOCAL_C_INCLUDES += $(JSONCPP_PATH)
LOCAL_MODULE_TAGS := optional
LOCAL_32_BIT_ONLY := true

include external/stlport/libstlport.mk

include $(BUILD_EXECUTABLE)
