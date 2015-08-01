LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := core.js
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_PATH  := $(TARGET_OUT)/silk

# Additional libraries for movie module
LOCAL_SHARED_LIBRARIES += \
  libEGL \
  libGLESv1_CM \
  libandroidfw \
  libbinder \
  libgui \
  liblog \
  libskia \
  libui \
  libutils \

include $(LOCAL_PATH)/../node_module.mk
