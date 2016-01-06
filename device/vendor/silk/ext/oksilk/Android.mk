LOCAL_PATH:= $(call my-dir)

# This is a hack so please don't copy this. Once we support copying directories
# properly move over to use that instead
$(shell mkdir -p $(TARGET_OUT_SILK_MEDIA)/pocketsphinx; \
  cp -rf $(LOCAL_PATH)/model/en-us-ptm-8khz $(TARGET_OUT_SILK_MEDIA)/pocketsphinx)

include $(CLEAR_VARS)
LOCAL_MODULE := oksilk-pocketsphinx-dict
LOCAL_INSTALLED_MODULE_STEM := cmudict-en-us.dict
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/pocketsphinx
LOCAL_PREBUILT_MODULE_FILE := external/pocketsphinx/model/en-us/cmudict-en-us.dict
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := oksilk-pocketsphinx-grammar
LOCAL_INSTALLED_MODULE_STEM := silk.gram
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/pocketsphinx
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/silk.gram
include $(BUILD_PREBUILT)
include $(BUILD_PREBUILT)

ifneq ($(ONE_SHOT_MAKEFILE),)
include $(LOCAL_PATH)/../ext.mk
$(eval $(call RENDER_EXTENSION_MK,$(LOCAL_PATH)))
endif
