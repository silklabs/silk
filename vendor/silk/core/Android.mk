LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := core.js
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := DATA
LOCAL_MODULE_PATH  := $(TARGET_OUT)/silk
LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_CUSTOM_INSTALLED_MODULE := true

#
# TODO: The gonk shared libraries list is a union of the shared libraries
#       required by node modules.
#
#       This is required because although additional gonk shared library
#       dependencies can be expressed in node-gyp these dependencies are not
#       currently surfaced to the gonk build system.
#
#       There is surely a better way to do this...
#

# Base set of libraries for all modules
npm_GONK_SHARED_LIBRARIES := libc.so libm.so libdl.so libstlport.so

# Additional libraries for movie module
npm_GONK_SHARED_LIBRARIES += \
  libEGL.so \
  libGLESv1_CM.so \
  libandroidfw.so \
  libbinder.so \
  libgui.so \
  liblog.so \
  libskia.so \
  libui.so \
  libutils.so \

npm_INCLUDES := \
  bionic \
  bionic/libc/arch-arm/include \
  bionic/libc/include \
  bionic/libm/include \
  bionic/libstdc++/include  \
  external/stlport/stlport \
  bionic/libc/kernel/uapi/asm-arm \
  bionic/libc/kernel/uapi \

ifeq (,$(filter $(TARGET_BUILD_VARIANT),eng))
npm_production:=--production
endif
npm_cli = $(abspath external/npm/cli.js)
npm_node_dir = $(abspath external/node)

npm_CFLAGS := $(TARGET_GLOBAL_CFLAGS) \
  $(addprefix -isystem ,$(abspath . $(TARGET_C_INCLUDES))) \
  $(foreach inc,$(npm_INCLUDES),-isystem $(abspath $(inc))) \

npm_CPPFLAGS := $(TARGET_GLOBAL_CPPFLAGS)
npm_LDFLAGS = $(TARGET_GLOBAL_LDFLAGS) \
  -B$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
  -L$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) -lstlport

LOCAL_ADDITIONAL_DEPENDENCIES := \
  $(shell find $(LOCAL_PATH) -type f) \

LOCAL_ADDITIONAL_DEPENDENCIES += \
  $(TARGET_CRTBEGIN_DYNAMIC_O) $(TARGET_CRTEND_O) \
  $(addprefix $(TARGET_OUT_INTERMEDIATE_LIBRARIES)/,$(sort $(npm_GONK_SHARED_LIBRARIES)))

include $(BUILD_PREBUILT)

$(LOCAL_BUILT_MODULE): export CC := $(abspath $(TARGET_CC))
$(LOCAL_BUILT_MODULE): export CXX := $(abspath $(TARGET_CXX))
$(LOCAL_BUILT_MODULE): export AR := $(abspath $(TARGET_AR))
$(LOCAL_BUILT_MODULE): export RANLIB := $(abspath $(TARGET_RANLIB))
$(LOCAL_BUILT_MODULE): export LINK := $(abspath $(TARGET_CXX))
$(LOCAL_BUILT_MODULE): export CFLAGS=$(npm_CFLAGS)
$(LOCAL_BUILT_MODULE): export CXXFLAGS=$(npm_CFLAGS) $(npm_CXXFLAGS)
$(LOCAL_BUILT_MODULE): export LDFLAGS=$(npm_LDFLAGS)
$(LOCAL_BUILT_MODULE): ABS_LOCAL_PATH := $(ANDROID_BUILD_TOP)/$(LOCAL_PATH)
$(LOCAL_BUILT_MODULE): export NPM_CONFIG_ARCH=arm
$(LOCAL_BUILT_MODULE): export NPM_CONFIG_PLATFORM=android

$(LOCAL_BUILT_MODULE):
	@echo "Mirror source: $@"
	$(hide) mkdir -p $(@D)
	$(hide) rsync -av $(ABS_LOCAL_PATH)/ $(@D)
	@echo "Build: $@"
	$(hide) cd $(@D) && \
   node $(npm_cli) install --ignore-scripts $(npm_production) --nodedir=$(npm_node_dir) --no-optional
	$(hide) cd $(@D) && \
   node $(npm_cli) dedup
	$(hide) cd $(@D) && \
   node $(npm_cli) rebuild $(npm_production) --nodedir=$(npm_node_dir)
	$(hide) cd $(@D) && \
   node $(npm_cli) install $(npm_production) --nodedir=$(npm_node_dir)

$(LOCAL_INSTALLED_MODULE): $(LOCAL_BUILT_MODULE)
	@echo "Install: $@"
	$(hide) mkdir -p $(@D)
	$(hide) cp -r $< $@
# Locate and copy native bindings from
#   ../node_modules/<foo>/Release/<foo>.node to /system/silk/build/<foo>.node
# so they can be resolved correctly from the browserify-ed silk.js via the
# /build symlink created from init.silk.rc
	$(hide) mkdir -p $(@D)/build
	$(hide) \
  for binding in `cd $(<D)/node_modules/ && find . -mindepth 4 -maxdepth 4 -type f -name *.node`; do \
    cp -f $(<D)/node_modules/$$binding $(@D)/build/`basename $$binding`; \
  done
