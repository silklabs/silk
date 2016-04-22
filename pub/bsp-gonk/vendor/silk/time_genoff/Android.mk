LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE           := silk-time_genoff
LOCAL_MODULE_STEM      := time_genoff
LOCAL_MODULE_TAGS      := optional
LOCAL_MODULE_CLASS     := EXECUTABLES
LOCAL_SRC_FILES        := time_genoff.cpp date.c
LOCAL_CFLAGS           += -Wno-multichar -Wextra -Werror
LOCAL_SHARED_LIBRARIES := liblog libdl
include $(BUILD_SILK_EXECUTABLE)
