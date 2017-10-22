LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)
LOCAL_NODE_MODULE_GYP_FLAGS := -Dliblog=true -Dlibpreview=true
LOCAL_SHARED_LIBRARIES += liblog
include $(BUILD_NODE_MODULE)
