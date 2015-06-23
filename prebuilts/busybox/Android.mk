LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := busybox
LOCAL_MODULE_TAGS  := optional debug
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := $(LOCAL_MODULE)
include $(BUILD_PREBUILT)
