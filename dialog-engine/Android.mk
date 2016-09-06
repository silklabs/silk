LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)


ifeq (,$(SILK_DIALOG_SCRIPT_PATH))
SILK_DIALOG_SCRIPT_PATH := $(ANDROID_BUILD_TOP)/../dialog-script
endif

LOCAL_PATH := $(realpath $(SILK_DIALOG_SCRIPT_PATH))
$(info ----------------------------------------------------------------)
$(info Using dialog-script from $(LOCAL_PATH))
$(info ----------------------------------------------------------------)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)
