
LOCAL_MODULE_TAGS  := optional debug
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT)/media
LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_SRC_DIR := $(LOCAL_PATH)/$(basename $(LOCAL_MODULE))

include $(BUILD_PREBUILT)

$(LOCAL_BUILT_MODULE): LOCAL_SRC_DIR := $(LOCAL_SRC_DIR)
$(LOCAL_BUILT_MODULE): $(shell find $(LOCAL_SRC_DIR) -type f)
	@echo Animation: $(notdir $@)
	$(hide) mkdir -p $(@D)
	$(hide) cd $(LOCAL_SRC_DIR) && zip -0 -r $(ANDROID_BUILD_TOP)/$@ *
