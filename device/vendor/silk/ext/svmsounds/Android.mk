LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := svmsounds-clap
LOCAL_INSTALLED_MODULE_STEM := clap-svm.json
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/svmsounds/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/clap-svm.json
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := svmsounds-firealarm
LOCAL_INSTALLED_MODULE_STEM := firealarm-svm.json
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/svmsounds/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/firealarm-svm.json
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := svmsounds-glassbreak
LOCAL_INSTALLED_MODULE_STEM := glassbreak-svm.json
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/svmsounds/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/glassbreak-svm.json
include $(BUILD_PREBUILT)

ifneq ($(ONE_SHOT_MAKEFILE),)
include $(LOCAL_PATH)/../ext.mk
$(eval $(call RENDER_EXTENSION_MK,$(LOCAL_PATH)))
endif

$(LOCAL_PATH)/model/clap-svm.json: ../webapp/public/clap-svm.json | $(ACP)
	$(copy-file-to-new-target)

$(LOCAL_PATH)/model/firealarm-svm.json: ../webapp/public/firealarm-svm.json | $(ACP)
	$(copy-file-to-new-target)

$(LOCAL_PATH)/model/glassbreak-svm.json: ../webapp/public/glassbreak-svm.json | $(ACP)
	$(copy-file-to-new-target)
