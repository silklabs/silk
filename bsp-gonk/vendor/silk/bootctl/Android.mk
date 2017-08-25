ifeq ($(TARGET_GE_NOUGAT),)
# Copyright 2015 The Android Open Source Project

LOCAL_PATH := $(call my-dir)
include $(CLEAR_VARS)

LOCAL_SRC_FILES := bootctl.c
LOCAL_SHARED_LIBRARIES := libhardware
LOCAL_MODULE := bootctl
LOCAL_C_INCLUDES += hardware/libhardware/include
ifeq (,$(wildcard hardware/libhardware/include/hardware/boot_control.h))
LOCAL_C_INCLUDES += $(LOCAL_PATH)/include
endif

include $(BUILD_EXECUTABLE)
endif
