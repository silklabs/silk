LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := dnn-pedestrian-proto
LOCAL_INSTALLED_MODULE_STEM := deploy.prototxt
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/dnn/model/ped
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/deploy.prototxt
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := dnn-pedestrian-dictionary
LOCAL_INSTALLED_MODULE_STEM := labels.txt
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/dnn/model/ped
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/labels.txt
include $(BUILD_PREBUILT)

ifneq ($(ONE_SHOT_MAKEFILE),)
include $(LOCAL_PATH)/../ext.mk
$(eval $(call RENDER_EXTENSION_MK,$(LOCAL_PATH)))
endif
