LOCAL_PATH:= $(call my-dir)

ifneq ($(TARGET_PRODUCT),silk_arm)  # Skip in the minimal build

include $(CLEAR_VARS)
LOCAL_MODULE       := base_version.js
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXT
LOCAL_SRC_FILES    := ../../core/lib/base_version.js
LOCAL_MODULE_PATH  := $(TARGET_OUT)/node_modules
include $(BUILD_PREBUILT)

endif
