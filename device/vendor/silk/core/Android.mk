LOCAL_PATH:= $(call my-dir)

# TODO: Remove this |if| when vendor/silk/core is refactored/moved
ifeq ($(strip $(SILK_DEVICE_MAIN_PATH)),)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)
else
$(warning Not using vendor/silk/core)
endif

include $(CLEAR_VARS)
LOCAL_MODULE := silk-props-json
LOCAL_INSTALLED_MODULE_STEM := silk-props.json
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK)
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/silk-props.json
include $(BUILD_PREBUILT)


ifneq ($(TARGET_PRODUCT),silk_arm)  # Skip in the base build

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-base-version
LOCAL_MODULE_STEM  := base_version.js
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_SRC_FILES    := lib/base_version.js
LOCAL_MODULE_PATH  := $(TARGET_OUT)/node_modules
include $(BUILD_PREBUILT)

endif
