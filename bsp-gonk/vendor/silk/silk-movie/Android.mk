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

SILK_MOVIE_EXTRA_CFLAGS=
ifneq ($(TARGET_GE_MARSHMALLOW),)
SILK_MOVIE_EXTRA_CFLAGS += -DM_FILEMAP -DM_ASSET_H
endif
ifneq (,$(wildcard vendor/cm))
SILK_MOVIE_EXTRA_CFLAGS += -DCM_13_ASSETMANAGER
endif
export SILK_MOVIE_EXTRA_CFLAGS

include $(BUILD_NODE_MODULE)
