LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_NODE_MODULE_TYPE := file
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
