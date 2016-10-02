LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE      := silk-capture-daemon
LOCAL_MODULE_STEM := capture
LOCAL_MODULE_TAGS := optional

LOCAL_SRC_FILES := \
	../SocketListener/FrameworkListener1.cpp \
	../SocketListener/SocketListener1.cpp \
	../jsoncpp/jsoncpp.cpp \
	AudioLooper.cpp \
	AudioMutter.cpp \
	AudioSourceEmitter.cpp \
	Capture.cpp \
	Channel.cpp \
	FaceDetection.cpp \
	IOpenCVCameraCapture.cpp \
	MPEG4SegmentDASHWriter.cpp \
	MPEG4SegmenterDASH.cpp \
	OpenCVCameraCapture.cpp \

ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_SRC_FILES += 6.x/MediaCodecSource.cpp
else
LOCAL_SRC_FILES += 5.1.1_r6/MediaCodecSource.cpp
endif

LOCAL_SHARED_LIBRARIES := \
  libstagefright libstagefright_foundation libutils liblog libbinder \
  libgui libcamera_client libcutils libsysutils libmedia

LOCAL_C_INCLUDES := \
  frameworks/av/media/libstagefright \
  frameworks/av/media/libstagefright/include \
  frameworks/av/media/libstagefright/mpeg2ts \
  frameworks/native/include/media/openmax \
  vendor/silk/jsoncpp \
  vendor/silk/SocketListener \

ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_C_INCLUDES += $(LOCAL_PATH)/6.x
ifneq (,$(wildcard frameworks/av/media/libavextensions))
LOCAL_C_INCLUDES += frameworks/av/media/libavextensions
LOCAL_CFLAGS += -DTARGET_USE_AVEXTENSIONS
endif
else
LOCAL_C_INCLUDES += $(LOCAL_PATH)/5.1.1_r6
endif

LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0
LOCAL_CFLAGS += -Dnullptr=0
ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DTARGET_GE_MARSHMALLOW
LOCAL_CFLAGS += -DIGNORE_UNWANTED_IFRAME_AT_FRAME2
endif

-include external/stlport/libstlport.mk

include $(BUILD_SILK_EXECUTABLE)


include $(CLEAR_VARS)
LOCAL_MODULE := libpreview
LOCAL_MODULE_TAGS := optional

LOCAL_SRC_FILES := \
  IOpenCVCameraCapture.cpp \
  libpreview.cpp \

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
ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DTARGET_GE_MARSHMALLOW
endif

include $(BUILD_SILK_SHARED_LIBRARY)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-mic
LOCAL_MODULE_STEM  := mic
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := mic.cpp AudioSourceEmitter.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -Dnullptr=0
ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DTARGET_GE_MARSHMALLOW
endif
LOCAL_SHARED_LIBRARIES := liblog libmedia libcutils libstagefright libutils
LOCAL_C_INCLUDES := frameworks/av/include
include $(BUILD_SILK_EXECUTABLE)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-capture-mic
LOCAL_MODULE_STEM  := capture-mic
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := capture-mic.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -Dnullptr=0
LOCAL_SHARED_LIBRARIES := liblog libcutils libutils
include $(BUILD_SILK_EXECUTABLE)

