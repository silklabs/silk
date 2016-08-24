$(info SILK_PRODUCT: $(SILK_PRODUCT))
$(info SILK_BOARD: $(SILK_BOARD))
SILK_CORE_VERSION=$(shell node -p "_=require('silk-core-version');_.branch+'/'+_.semver")/$(shell git rev-parse HEAD | cut -b 1-7)
$(info $(SILK_CORE_VERSION))
$(info ============================================)


ifeq (,$(strip $(BUILD_FINGERPRINT)))
  BUILD_FINGERPRINT := Silk/$(SILK_BOARD)/$(SILK_PRODUCT)/$(TARGET_BUILD_VARIANT):$(SILK_CORE_VERSION):$(USER)_$(shell date +%m/%d_%H:%M)
endif

SILK_BUILD_FILES := $(dir $(lastword $(MAKEFILE_LIST)))

CLEAR_VARS += $(SILK_BUILD_FILES)node_module_clear_vars.mk
BUILD_NODE_MODULE := $(SILK_BUILD_FILES)node_module.mk

BUILD_SILK_EXECUTABLE := $(SILK_BUILD_FILES)silk_executable.mk
BUILD_SILK_SHARED_LIBRARY := $(SILK_BUILD_FILES)silk_shared_library.mk

TARGET_OUT_SILK := $(TARGET_OUT)/silk
TARGET_OUT_SILK_EXECUTABLES := $(TARGET_OUT_SILK)/bin
TARGET_OUT_SILK_SHARED_LIBRARIES := $(TARGET_OUT_SILK)/lib
TARGET_OUT_SILK_NODE_MODULES := $(TARGET_OUT_SILK)/node_modules
TARGET_OUT_SILK_MEDIA := $(TARGET_OUT_SILK)/media
