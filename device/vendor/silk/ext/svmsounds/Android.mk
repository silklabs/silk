LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := svmsounds-clap
LOCAL_INSTALLED_MODULE_STEM := clap-svm.raw
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/svmsounds/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/clap-svm.raw
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := svmsounds-firealarm
LOCAL_INSTALLED_MODULE_STEM := firealarm-svm.raw
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/svmsounds/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/firealarm-svm.raw
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := svmsounds-glassbreak
LOCAL_INSTALLED_MODULE_STEM := glassbreak-svm.raw
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/svmsounds/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/glassbreak-svm.raw
include $(BUILD_PREBUILT)

ifneq ($(ONE_SHOT_MAKEFILE),)
include $(LOCAL_PATH)/../ext.mk
$(eval $(call RENDER_EXTENSION_MK,$(LOCAL_PATH)))
endif
