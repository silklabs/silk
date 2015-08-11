LOCAL_PATH := $(call my-dir)

EXT_ANDROID_MKS := $(call all-makefiles-under,$(LOCAL_PATH))
include $(LOCAL_PATH)/ext.mk

# Build a virtual Android.mk for all the package.json files within this
# directory
$(foreach ext,$(dir $(wildcard $(LOCAL_PATH)/*/package.json)), \
  $(eval $(call RENDER_EXTENSION_MK,$(ext))) \
 )

# Permit extensions to include an optional Andriod.mk (not needed normally)
include $(EXT_ANDROID_MKS)
