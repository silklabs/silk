LOCAL_PATH:= $(call my-dir)
ROOT := vendor/silk/gonk

include $(CLEAR_VARS)
LOCAL_MODULE := capture
LOCAL_MODULE_TAGS := optional

LOCAL_SRC_FILES := \
	../SocketListener/SocketListener1.cpp \
	../jsoncpp/jsoncpp.cpp \
	AudioLooper.cpp \
	AudioMutter.cpp \
	AudioSourceEmitter.cpp \
	Capture.cpp \
	Channel.cpp \
	FaceDetection.cpp \
	IOpenCVCameraCapture.cpp \
	MediaCodecSource.cpp \
	MPEG4MemoryWriter.cpp \
	MPEG4SegmentDASHWriter.cpp \
	MPEG4SegmenterDASH.cpp \
	OpenCVCameraCapture.cpp \
	SlicedMP4Encoder.cpp \

LOCAL_SHARED_LIBRARIES := \
	libstagefright libstagefright_foundation libutils liblog libbinder \
	libgui libcamera_client libcutils libsysutils

LOCAL_C_INCLUDES := \
	frameworks/av/media/libstagefright \
	frameworks/av/media/libstagefright/include \
	frameworks/native/include/media/openmax \
	. \

LOCAL_C_INCLUDES += $(ROOT)/jsoncpp
LOCAL_C_INCLUDES += $(ROOT)/SocketListener

LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0
LOCAL_CFLAGS += -Dnullptr=0

include external/stlport/libstlport.mk

include $(BUILD_SILK_EXECUTABLE)


include $(CLEAR_VARS)
LOCAL_MODULE := libnative_camera_capture
LOCAL_MODULE_TAGS := optional
LOCAL_MODULE_PATH := $(TARGET_OUT_SILK_NODE_MODULES)/build #<-- where OpenCV looks for "libnative_camera" shared objects

LOCAL_SRC_FILES := \
  IOpenCVCameraCapture.cpp \
  libnative_camera_capture.cpp \

LOCAL_SHARED_LIBRARIES := \
  libbinder \
  libcamera_client \
  libcutils \
  libgui \
  liblog \
  libui \
  libutils \

LOCAL_C_INCLUDES := . \
  frameworks/native/include/media/openmax \

LOCAL_CFLAGS += -Wextra -Werror

ifeq ($(TARGET_CPUCONSUMER_ONFRAMEAVAILABLE__NOITEM), true)
# Select the (older) CAF version of the CpuConsumer interface
LOCAL_CFLAGS += -DCAF_CPUCONSUMER
endif

include $(BUILD_SILK_SHARED_LIBRARY)
