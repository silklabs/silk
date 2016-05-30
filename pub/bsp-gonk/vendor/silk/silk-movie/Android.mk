LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_SHARED_LIBRARIES += \
  libEGL \
  libGLESv1_CM \
  libandroidfw \
  libbinder \
  libgui \
  liblog \
  libskia \
  libui \
  libutils

ifneq ($(TARGET_GE_MARSHMALLOW),)
export SILK_MOVIE_EXTRA_CFLAGS=-DM_FILEMAP
endif

include $(BUILD_NODE_MODULE)
