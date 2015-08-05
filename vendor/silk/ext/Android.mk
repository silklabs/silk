LOCAL_PATH:= $(call my-dir)

define RENDER_EXTENSION_MK
LOCAL_PATH:=$(1)
include $(CLEAR_VARS)
LOCAL_MODULE_PATH := $(TARGET_OUT)/silk/ext
LOCAL_NODE_MODULE_TYPE := file
include $(BUILD_NODE_MODULE)
endef

# Build a virtual Android.mk for all the package.json files within this
# directory
$(foreach ext,$(dir $(wildcard $(LOCAL_PATH)/*/package.json)), \
  $(eval $(call RENDER_EXTENSION_MK,$(ext))) \
 )
