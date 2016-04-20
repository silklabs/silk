CLEAR_VARS += vendor/silk/build/node_module_clear_vars.mk
BUILD_NODE_MODULE := vendor/silk/build/node_module.mk

BUILD_SILK_EXECUTABLE := vendor/silk/build/silk_executable.mk
BUILD_SILK_SHARED_LIBRARY := vendor/silk/build/silk_shared_library.mk

TARGET_OUT_SILK := $(TARGET_OUT)/silk
TARGET_OUT_SILK_EXECUTABLES := $(TARGET_OUT_SILK)/bin
TARGET_OUT_SILK_SHARED_LIBRARIES := $(TARGET_OUT_SILK)/lib
TARGET_OUT_SILK_NODE_MODULES := $(TARGET_OUT_SILK)/node_modules
TARGET_OUT_SILK_MEDIA := $(TARGET_OUT_SILK)/media
