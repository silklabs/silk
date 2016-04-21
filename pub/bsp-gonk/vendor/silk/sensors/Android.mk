LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := silk-sensors

LOCAL_SRC_FILES := ../jsoncpp/jsoncpp.cpp \
                   ../SocketListener/FrameworkListener1.cpp \
                   ../SocketListener/SocketListener1.cpp \
                   main.cpp \

LOCAL_CFLAGS += -Wall -Wextra
LOCAL_CFLAGS += -Wno-unused-parameter
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0

LOCAL_SHARED_LIBRARIES := liblog \
                          libhardware \
                          libsysutils \
                          libutils \

LOCAL_C_INCLUDES := hardware/libhardware/include \
                    $(LOCAL_PATH)/../jsoncpp \
                    $(LOCAL_PATH)/../SocketListener \

LOCAL_MODULE_TAGS := optional

-include external/stlport/libstlport.mk

include $(BUILD_SILK_EXECUTABLE)
