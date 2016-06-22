LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional

LOCAL_SHARED_LIBRARIES := \
  liblog \
  libhardware \
  libsysutils \
  libutils \
  libcutils \
  libdl \
  libmedia \
  libstagefright_foundation \

include $(BUILD_NODE_MODULE)
