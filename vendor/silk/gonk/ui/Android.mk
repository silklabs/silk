LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := logo.png
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT)/media
LOCAL_SRC_FILES = $(LOCAL_MODULE)
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := bootanimation.zip
include $(LOCAL_PATH)/animation.mk

include $(CLEAR_VARS)
LOCAL_MODULE := setup.zip
include $(LOCAL_PATH)/animation.mk

include $(CLEAR_VARS)
LOCAL_MODULE := connecting.zip
include $(LOCAL_PATH)/animation.mk

include $(CLEAR_VARS)
LOCAL_MODULE := online.zip
include $(LOCAL_PATH)/animation.mk

include $(CLEAR_VARS)
LOCAL_MODULE := powerdown.zip
include $(LOCAL_PATH)/animation.mk
