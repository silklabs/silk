# Copyright (C) 2012 Mozilla Foundation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := fakeappops
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := fakeappops.cpp
LOCAL_SHARED_LIBRARIES := libbinder libutils
include $(BUILD_SILK_EXECUTABLE)


ifneq ($(wildcard frameworks/av/services/audioflinger),)
include $(CLEAR_VARS)
LOCAL_MODULE       := gonksched
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := EXECUTABLES
LOCAL_SRC_FILES    := gonksched.cpp
# Inline libscheduling_policy.a as it is not available for the base build
LOCAL_SRC_FILES += \
  ../../../../frameworks/av/services/audioflinger/ISchedulingPolicyService.cpp \
  ../../../../frameworks/av/services/audioflinger/SchedulingPolicyService.cpp
LOCAL_SHARED_LIBRARIES := libbinder libutils libcutils
LOCAL_C_INCLUDES := frameworks/av/services/audioflinger
include $(BUILD_SILK_EXECUTABLE)
endif
