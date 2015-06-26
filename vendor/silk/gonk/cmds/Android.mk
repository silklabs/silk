LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)

LOCAL_SRC_FILES:=        \
	stream-video.cpp MPEG4MemoryWriter.cpp MediaCodecSource.cpp

LOCAL_SHARED_LIBRARIES := \
	libstagefright libstagefright_foundation libutils liblog libbinder \
	libgui libui libcamera_client libcutils libjpeg

LOCAL_C_INCLUDES:= \
	frameworks/av/media/libstagefright \
	frameworks/av/media/libstagefright/include \
	$(TOP)/frameworks/native/include/media/openmax \
	external/jpeg

LOCAL_CFLAGS += -Wno-multichar

LOCAL_MODULE_TAGS := optional

LOCAL_MODULE:= stream-video

include $(BUILD_EXECUTABLE)

################################################################################
