LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE       := cvtest_togray
LOCAL_MODULE_TAGS  := optional eng
LOCAL_SRC_FILES    := main.cpp
LOCAL_32_BIT_ONLY := true

include external/opencv2/opencv.mk

include $(BUILD_EXECUTABLE)
