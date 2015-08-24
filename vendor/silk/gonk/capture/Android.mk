LOCAL_PATH:= $(call my-dir)
ROOT := vendor/silk/gonk

include $(CLEAR_VARS)
LOCAL_MODULE := capture
LOCAL_MODULE_TAGS := optional

LOCAL_SRC_FILES := \
	../SocketListener/SocketListener1.cpp \
	../jsoncpp/jsoncpp.cpp \
	AudioSourceEmitter.cpp \
	Capture.cpp \
	Channel.cpp \
	FaceDetection.cpp \
	MPEG4MemoryWriter.cpp \
	MediaCodecSource.cpp \
	PreviewMediaSource.cpp \
	SlicedMP4Encoder.cpp \
	IOpenCVCameraCapture.cpp \
	OpenCVCameraCapture.cpp \
	OpenCVCameraRecordingProxy.cpp \

LOCAL_SHARED_LIBRARIES := \
	libstagefright libstagefright_foundation libutils liblog libbinder \
	libgui libui libcamera_client libcutils libjpeg libsysutils

LOCAL_C_INCLUDES := \
	frameworks/av/media/libstagefright \
	frameworks/av/media/libstagefright/include \
	frameworks/native/include/media/openmax \
	external/jpeg \
	. \

LOCAL_C_INCLUDES += $(ROOT)/jsoncpp
LOCAL_C_INCLUDES += $(ROOT)/SocketListener

LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0

include external/stlport/libstlport.mk

include $(BUILD_SILK_EXECUTABLE)


include $(CLEAR_VARS)
LOCAL_MODULE := libnative_camera_capture
LOCAL_MODULE_TAGS := optional
LOCAL_MODULE_PATH := $(TARGET_OUT_SILK_NODE_MODULES)/build #<-- where OpenCV looks for "libnative_camera" shared objects

LOCAL_SRC_FILES := \
  libnative_camera_capture.cpp \
  IOpenCVCameraCapture.cpp \

LOCAL_SHARED_LIBRARIES := \
  libbinder \
  libcamera_client \
  liblog \
  libutils \

LOCAL_C_INCLUDES := .

LOCAL_CFLAGS += -Wextra -Werror

include $(BUILD_SILK_SHARED_LIBRARY)
