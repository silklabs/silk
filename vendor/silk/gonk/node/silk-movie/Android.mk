LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-movie.node
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_PATH := $(TARGET_OUT)/silk/node_modules
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
include $(BUILD_NODE_MODULE)
