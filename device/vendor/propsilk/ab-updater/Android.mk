LOCAL_PATH := $(call my-dir)

ifneq (,$(wildcard bootable/recovery))

include $(CLEAR_VARS)
LOCAL_MODULE := silk-ab-updater
LOCAL_CFLAGS += \
  -Wno-unused-parameter \
  -DRECOVERY_API_VERSION=3 \

ifeq ($(TARGET_GE_MARSHMALLOW),)
LOCAL_CFLAGS += -DINSTALL_PACKAGE_WIPE_CACHE_IS_INT
endif

LOCAL_SRC_FILES := \
  ../../../bootable/recovery/asn1_decoder.cpp \
  ../../../bootable/recovery/install.cpp \
  ../../../bootable/recovery/ui.cpp \
  ../../../bootable/recovery/verifier.cpp \
  main.cpp \

LOCAL_C_INCLUDES := \
  hardware/libhardware/include \
  bootable/recovery \

ifeq (,$(wildcard hardware/libhardware/include/hardware/boot_control.h))
LOCAL_C_INCLUDES += vendor/opensilk/bootctl/include
endif

LOCAL_SHARED_LIBRARIES := \
  libhardware \

LOCAL_STATIC_LIBRARIES := \
  libcutils \
  liblog \
  libm \
  libmincrypt \
  libminui \
  libminzip \
  libstdc++ \
  libutils \
  libz \

include $(BUILD_SILK_EXECUTABLE)

endif
