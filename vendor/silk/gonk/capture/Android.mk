LOCAL_PATH:= $(call my-dir)
ROOT := vendor/silk/gonk

include $(CLEAR_VARS)

LOCAL_SRC_FILES:=        \
	../SocketListener/SocketListener1.cpp \
	../jsoncpp/jsoncpp.cpp \
	Capture.cpp \
	Channel.cpp \
	FaceDetection.cpp \
	MPEG4MemoryWriter.cpp \
	MediaCodecSource.cpp \
	PreviewMediaSource.cpp \
	SlicedMP4Encoder.cpp \

LOCAL_SHARED_LIBRARIES := \
	libstagefright libstagefright_foundation libutils liblog libbinder \
	libgui libui libcamera_client libcutils libjpeg libsysutils

LOCAL_C_INCLUDES:= \
	frameworks/av/media/libstagefright \
	frameworks/av/media/libstagefright/include \
	$(TOP)/frameworks/native/include/media/openmax \
	external/jpeg
LOCAL_C_INCLUDES += $(ROOT)/jsoncpp
LOCAL_C_INCLUDES += $(ROOT)/SocketListener

LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0

LOCAL_MODULE_TAGS := optional

LOCAL_MODULE:= capture

include external/stlport/libstlport.mk

include $(BUILD_EXECUTABLE)

################################################################################
