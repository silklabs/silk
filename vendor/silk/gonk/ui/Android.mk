LOCAL_PATH:= $(call my-dir)

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
