LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := silk-tts
LOCAL_MODULE_STEM := tts

LOCAL_SRC_FILES := ../jsoncpp/jsoncpp.cpp \
                   main.cpp \
                   AudioPlayer.cpp \

LOCAL_CFLAGS += -Wall -Wextra
LOCAL_CFLAGS += -Wno-unused-parameter
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0

LOCAL_SHARED_LIBRARIES := liblog \
                          libhardware \
                          libsysutils \
                          libutils \
                          libttspico \
                          libmedia \
                          libstagefright_foundation \

LOCAL_C_INCLUDES += hardware/libhardware/include \
                    $(LOCAL_PATH)/../jsoncpp \
                    external/svox/pico/compat/include \

LOCAL_MODULE_TAGS := optional

include external/stlport/libstlport.mk

include $(BUILD_SILK_EXECUTABLE)
