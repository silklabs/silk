LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)

LOCAL_STATIC_LIBRARIES := \
  webrtc_common_audio_common_audio_gyp \
  webrtc_common_audio_common_audio_neon_gyp \

LOCAL_SHARED_LIBRARIES := \
  liblog \

include $(BUILD_NODE_MODULE)
