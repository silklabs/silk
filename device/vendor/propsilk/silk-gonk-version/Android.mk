LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)


include $(CLEAR_VARS)
LOCAL_MODULE       := silk-base-gonk-version
LOCAL_MODULE_STEM  := base_version.js
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_SRC_FILES    := gonk_version.js
LOCAL_MODULE_PATH  := $(TARGET_OUT)/node_modules
include $(BUILD_PREBUILT)
