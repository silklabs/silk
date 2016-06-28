LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-volume
LOCAL_MODULE_STEM  := volume
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := volume.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror
LOCAL_SHARED_LIBRARIES := liblog libmedia libcutils
LOCAL_C_INCLUDES := frameworks/av/include
include $(BUILD_SILK_EXECUTABLE)
