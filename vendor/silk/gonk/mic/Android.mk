LOCAL_PATH:= $(call my-dir)
ROOT := vendor/silk/gonk

include $(CLEAR_VARS)

LOCAL_MODULE:= mic
LOCAL_MODULE_TAGS := optional

LOCAL_SRC_FILES:=        \
	../SocketListener/SocketListener1.cpp \
	../jsoncpp/jsoncpp.cpp \
	Mic.cpp \
	Channel.cpp \
	AudioReader.cpp \

LOCAL_SHARED_LIBRARIES := \
	libstagefright libstagefright_foundation libutils liblog libbinder \
	libgui libui libcutils libjpeg libsysutils

LOCAL_C_INCLUDES:= \
	frameworks/av/media/libstagefright \
	frameworks/av/media/libstagefright/include \
	frameworks/native/include/media/openmax \

LOCAL_C_INCLUDES += $(ROOT)/jsoncpp $(ROOT)/SocketListener

LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0

LOCAL_32_BIT_ONLY := true

include external/stlport/libstlport.mk

include $(BUILD_EXECUTABLE)

################################################################################
