LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := core.js
LOCAL_MODULE_TAGS  := optional debug
LOCAL_MODULE_CLASS := DATA
LOCAL_MODULE_PATH  := $(TARGET_OUT_DATA)/silk
LOCAL_CUSTOM_BUILT_MODULE := true

# Entry point into the silk/core code.
SILK_CORE_MAIN_JS := dist/lib/main.js

SILK_JS_SRCS := $(wildcard $(LOCAL_PATH)/lib/*.js)
SILK_JS_SRCS += $(wildcard $(LOCAL_PATH)/lib/btle/*.js)
SILK_JS_SRCS += $(wildcard $(LOCAL_PATH)/server/dist/api/*.js)

include $(BUILD_PREBUILT)

$(LOCAL_BUILT_MODULE): $(dir $(LOCAL_BUILT_MODULE))Gruntfile.js $(SILK_JS_SRCS) $(LOCAL_PATH)/package.json
	@echo "Build: $@"
	$(hide) # Ensure modifications to server/dist/ are picked up in incremental builds (#106)
	$(hide) cd $(dir $@) && rm -rf node_modules/silk-api
	$(hide) cd $(dir $@) && npm install
	$(hide) cd $(dir $@) && node node_modules/browserify/bin/cmd.js --node --ignore-missing $(SILK_CORE_MAIN_JS) -o $(notdir $@)

$(dir $(LOCAL_BUILT_MODULE))Gruntfile.js: SRCDIR := $(abspath $(LOCAL_PATH))
$(dir $(LOCAL_BUILT_MODULE))Gruntfile.js: $(LOCAL_PATH)/Gruntfile.js
	@echo "Setup: $@"
	$(hide) mkdir -p $(dir $@)/node_modules
	$(hide) cd $(dir $@) \
  && ln -sf $(SRCDIR)/package.json . \
  && ln -sf $(SRCDIR)/lib . \
  && ln -sf $(SRCDIR)/server .
	$(hide) cp $< $@ # Grunt is not ok with a symlink'ed Gruntfile!

