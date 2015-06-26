LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := core.js
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := DATA
LOCAL_MODULE_PATH  := $(TARGET_OUT)/silk
LOCAL_CUSTOM_BUILT_MODULE := true

LOCAL_ADDITIONAL_DEPENDENCIES := $(shell find $(LOCAL_PATH)/lib -type f)
LOCAL_ADDITIONAL_DEPENDENCIES += \
  $(LOCAL_PATH)/package.json $(LOCAL_PATH)/Android.mk

include $(BUILD_PREBUILT)

$(LOCAL_BUILT_MODULE): $(dir $(LOCAL_BUILT_MODULE))Gruntfile.js
	@echo "Build: $@"
	$(hide) cd $(dir $@) && npm install

$(dir $(LOCAL_BUILT_MODULE))Gruntfile.js: SRCDIR := $(abspath $(LOCAL_PATH))
$(dir $(LOCAL_BUILT_MODULE))Gruntfile.js: $(LOCAL_PATH)/Gruntfile.js
	@echo "Setup: $@"
	$(hide) mkdir -p $(dir $@)/node_modules
	$(hide) cd $(dir $@) && ln -sf $(SRCDIR)/package.json .
	$(hide) cd $(dir $@) && ln -sf $(SRCDIR)/lib .
	$(hide) cp $< $@ # Grunt is not ok with a symlink'ed Gruntfile!

