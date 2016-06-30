LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := silk-player
LOCAL_MODULE_STEM  := player
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := player.cpp
LOCAL_CFLAGS += -Wno-multichar -Wextra -Werror
LOCAL_SHARED_LIBRARIES := libbinder liblog libutils libmedia
LOCAL_C_INCLUDES := frameworks/av/include
include $(BUILD_SILK_EXECUTABLE)
