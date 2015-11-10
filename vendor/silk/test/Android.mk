# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_PATH  := $(TARGET_OUT)/silk
LOCAL_INSTALL_NODE_MODULES := true
LOCAL_MODULE_TAGS := eng debug
include $(BUILD_NODE_MODULE)

# These are the modules that package.json adds to NODE_PATH in the "install"
# script as framework.js depends on them.  They need be explicitly depended
# on to ensure they are built before the local |npm install| attempts to find
# them.
#
# TODO: This is fragile and should be re-factored to remove the coupling here
SNEAKY_SILKTEST_DEPENDENT_MODULES := core detectobject trackobject
$(LOCAL_BUILT_MODULE): $(foreach module, \
  $(SNEAKY_SILKTEST_DEPENDENT_MODULES), \
  $(call intermediates-dir-for,$(LOCAL_MODULE_CLASS),$(module))/$(module).js)
