LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional

LOCAL_SHARED_LIBRARIES := \
  libbinder \
  liblog \
  libutils \
  libmedia \

include $(BUILD_NODE_MODULE)
