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
  SocketChannel.cpp \
  H264SourceEmitter.cpp \
  IOpenCVCameraCapture.cpp \
  MPEG4SegmentDASHWriter.cpp \
  MPEG4SegmenterDASH.cpp \
  OpenCVCameraCapture.cpp \

ifneq ($(TARGET_GE_NOUGAT),)
LOCAL_SRC_FILES += 7.x/MediaCodecSource.cpp
else ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_SRC_FILES += 6.x/MediaCodecSource.cpp
else
LOCAL_SRC_FILES += 5.1.1_r6/MediaCodecSource.cpp
endif

LOCAL_SHARED_LIBRARIES := \
  libbinder \
  libcamera_client \
  libcutils \
  libgui \
  liblog \
  libmedia \
  libstagefright \
  libstagefright_foundation \
  libsysutils \
  libutils \

LOCAL_C_INCLUDES := \
  frameworks/av/media/libstagefright \
  frameworks/av/media/libstagefright/include \
  frameworks/av/media/libstagefright/mpeg2ts \
  frameworks/native/include/media/openmax \
  system/media/camera/include \
  vendor/silk/jsoncpp \
  vendor/silk/SocketListener \

ifneq ($(TARGET_GE_NOUGAT),)
LOCAL_C_INCLUDES += $(LOCAL_PATH)/7.x
LOCAL_C_INCLUDES += frameworks/native/include/media/hardware
else ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_C_INCLUDES += $(LOCAL_PATH)/6.x
ifneq (,$(wildcard frameworks/av/media/libavextensions))
LOCAL_C_INCLUDES += frameworks/av/media/libavextensions
LOCAL_CFLAGS += -DTARGET_USE_AVEXTENSIONS
endif
else
LOCAL_C_INCLUDES += $(LOCAL_PATH)/5.1.1_r6
endif

LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -std=c++11
LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0

ifneq ($(TARGET_USE_CAMERA2),)
LOCAL_CFLAGS += -DTARGET_USE_CAMERA2
LOCAL_CFLAGS += -Wno-mismatched-tags # |struct CaptureRequest| is forward declared as a |class|
endif

ifneq ($(TARGET_GE_NOUGAT),)
LOCAL_CFLAGS += -DTARGET_GE_NOUGAT
endif
ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DTARGET_GE_MARSHMALLOW
LOCAL_CFLAGS += -DIGNORE_UNWANTED_IFRAME_AT_FRAME2
else
# c++11 on some pre-M gonks is missing std::unique_ptr
LOCAL_CFLAGS += -DJSONCPP_USE_AUTOPTR
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

LOCAL_CFLAGS += -Wextra -Werror -std=c++11

ifeq ($(TARGET_CPUCONSUMER_ONFRAMEAVAILABLE__NOITEM), true)
# Select the (older) CAF version of the CpuConsumer interface
LOCAL_CFLAGS += -DCAF_CPUCONSUMER
endif
ifneq ($(TARGET_GE_NOUGAT),)
LOCAL_CFLAGS += -DTARGET_GE_NOUGAT
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
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -std=c++11
ifneq ($(TARGET_GE_NOUGAT),)
LOCAL_CFLAGS += -DTARGET_GE_NOUGAT
endif
ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DTARGET_GE_MARSHMALLOW
endif
LOCAL_SHARED_LIBRARIES := \
  libbinder \
  libcutils \
  liblog \
  libmedia \
  libstagefright \
  libstagefright_foundation \
  libutils \

LOCAL_C_INCLUDES := frameworks/av/include
include $(BUILD_SILK_EXECUTABLE)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-capture-mic
LOCAL_MODULE_STEM  := capture-mic
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := capture-mic.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -std=c++11
LOCAL_SHARED_LIBRARIES := liblog libcutils libutils
include $(BUILD_SILK_EXECUTABLE)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-capture-h264
LOCAL_MODULE_STEM  := capture-h264
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := capture-h264.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -std=c++11
LOCAL_SHARED_LIBRARIES := liblog libcutils libutils
include $(BUILD_SILK_EXECUTABLE)

include $(CLEAR_VARS)
LOCAL_MODULE := libsilkSimpleH264Encoder
LOCAL_MODULE_TAGS := optional
LOCAL_SRC_FILES := SimpleH264Encoder.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -std=c++11
LOCAL_SHARED_LIBRARIES := \
  libbinder \
  liblog \
  libmedia \
  libstagefright \
  libstagefright_foundation \
  libutils \

LOCAL_C_INCLUDES := . \
  frameworks/native/include/media/openmax \

ifneq ($(TARGET_GE_NOUGAT),)
LOCAL_CFLAGS += -DTARGET_GE_NOUGAT
LOCAL_SRC_FILES += SharedSimpleH264Encoder.cpp
LOCAL_C_INCLUDES += $(LOCAL_PATH)/7.x
LOCAL_SRC_FILES += 7.x/MediaCodecSource.cpp
else ifneq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_C_INCLUDES += $(LOCAL_PATH)/6.x
LOCAL_SRC_FILES += 6.x/MediaCodecSource.cpp
LOCAL_SRC_FILES += SharedSimpleH264Encoder.cpp
ifneq (,$(wildcard frameworks/av/media/libavextensions))
LOCAL_C_INCLUDES += frameworks/av/media/libavextensions
LOCAL_CFLAGS += -DTARGET_USE_AVEXTENSIONS
endif
else
LOCAL_C_INCLUDES += $(LOCAL_PATH)/5.1.1_r6
LOCAL_SRC_FILES += 5.1.1_r6/MediaCodecSource.cpp
LOCAL_SRC_FILES += SharedSimpleH264EncoderStub.cpp
include external/stlport/libstlport.mk
endif

include $(BUILD_SILK_SHARED_LIBRARY)


ifneq ($(TARGET_GE_MARSHMALLOW),)
include $(CLEAR_VARS)
LOCAL_MODULE       := h264EncodeTest
LOCAL_MODULE_TAGS  := debug
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := h264EncodeTest.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -std=c++11
LOCAL_SHARED_LIBRARIES := \
  libbinder \
  libcutils \
  libdl \
  liblog \
  libsilkSimpleH264Encoder \
  libutils \
  libstagefright \

include $(BUILD_SILK_EXECUTABLE)

include $(CLEAR_VARS)
LOCAL_MODULE       := h264SharedEncodeTest
LOCAL_MODULE_TAGS  := debug
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := h264SharedEncodeTest.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror -std=c++11
LOCAL_SHARED_LIBRARIES := \
  libbinder \
  libcutils \
  libdl \
  liblog \
  libsilkSimpleH264Encoder \
  libutils \
  libstagefright \

-include external/stlport/libstlport.mk
include $(BUILD_SILK_EXECUTABLE)
endif

