# Copyright (C) 2009 The Android Open Source Project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,k
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
LOCAL_PATH := $(call my-dir)

MY_ARCH_FOLDER := $(TARGET_ARCH)
ifeq ($(MY_ARCH_FOLDER),arm)
    MY_ARCH_FOLDER = armv7-a
endif
ifeq ($(MY_ARCH_FOLDER),x86)
    MY_ARCH_FOLDER = i686
endif
ifeq ($(MY_ARCH_FOLDER),mips)
    MY_ARCH_FOLDER = mips32
endif

external_dir := $(realpath $(LOCAL_PATH)/../..)

include $(CLEAR_VARS)
LOCAL_MODULE := sodium
LOCAL_SRC_FILES := \
  $(external_dir)/libsodium-android-$(MY_ARCH_FOLDER)/lib/libsodium.a \

include $(PREBUILT_STATIC_LIBRARY)


include $(CLEAR_VARS)
LOCAL_MODULE    := sodiumjni
LOCAL_SRC_FILES := \
  sodium_wrap.c \

LOCAL_CFLAGS   += -Wall -g -pedantic -std=c99
LOCAL_C_INCLUDES += \
  $(external_dir)/libsodium-android-$(MY_ARCH_FOLDER)/include \
  $(external_dir)/libsodium-android-$(MY_ARCH_FOLDER)/include/sodium \

LOCAL_STATIC_LIBRARIES += android_native_app_glue sodium
include $(BUILD_SHARED_LIBRARY)
