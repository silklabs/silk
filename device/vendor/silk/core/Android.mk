LOCAL_PATH:= $(call my-dir)

# TODO: Remove this |if| when vendor/silk/core is refactored/moved
ifeq ($(strip $(SILK_DEVICE_MAIN_PATH)),)
include $(CLEAR_VARS)
include $(BUILD_NODE_MODULE)
else
$(warning Not using vendor/silk/core)
endif
