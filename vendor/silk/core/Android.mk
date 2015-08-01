LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE       := core.js
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := DATA
LOCAL_MODULE_PATH  := $(TARGET_OUT)/silk
LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_CUSTOM_INSTALLED_MODULE := true

# Base set of libraries for all modules
LOCAL_SHARED_LIBRARIES := libc libm libdl libstlport

# Additional libraries for movie module
LOCAL_SHARED_LIBRARIES += \
  libEGL \
  libGLESv1_CM \
  libandroidfw \
  libbinder \
  libgui \
  liblog \
  libskia \
  libui \
  libutils \

npm_INCLUDES := \
  bionic \
  bionic/libc/arch-arm/include \
  bionic/libc/include \
  bionic/libm/include \
  bionic/libstdc++/include  \
  external/stlport/stlport \
  bionic/libc/kernel/uapi/asm-arm \
  bionic/libc/kernel/uapi \

npm_cli = $(abspath external/npm/cli.js)
npm_node_dir = $(abspath external/$(or $(NODE_ENGINE),node))

npm_CFLAGS := $(TARGET_GLOBAL_CFLAGS) \
  $(addprefix -isystem ,$(abspath . $(TARGET_C_INCLUDES))) \
  $(foreach inc,$(npm_INCLUDES),-isystem $(abspath $(inc))) \

npm_CPPFLAGS := $(TARGET_GLOBAL_CPPFLAGS)
npm_LDFLAGS = $(TARGET_GLOBAL_LDFLAGS) \
  -B$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
  -L$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) -lstlport

LOCAL_ADDITIONAL_DEPENDENCIES := \
  $(shell find $(LOCAL_PATH) -type f) \
  $(TARGET_CRTBEGIN_DYNAMIC_O) $(TARGET_CRTEND_O) \

include $(BUILD_PREBUILT)

LOCAL_NODE_MODULES:=$(notdir $(wildcard $(LOCAL_PATH)/local_node_modules/*))

ifneq ($(ONE_SHOT_MAKEFILE),)
#
# Usage:
#   $ mm import_node_modules
#
# This target should be run any time a new package is added to package.json,
# to ensure that the package is also added to node_modules/.  This is necessary
# to avoid the npm registry at build time as well as locking down exact package
# versions used to avoid unexpected source changes
#
#
.PHONY import_node_modules:
import_node_modules: export NPM_CONFIG_ARCH=arm
import_node_modules: export NPM_CONFIG_PLATFORM=android
import_node_modules: LOCAL_PATH := $(LOCAL_PATH)
import_node_modules:
	cd $(LOCAL_PATH) && \
   git rm -r node_modules
	cd $(LOCAL_PATH) && \
   node $(npm_cli) install --ignore-scripts --no-optional
	cd $(LOCAL_PATH) && \
   node $(npm_cli) dedup
	cd $(LOCAL_PATH) && \
   $(foreach n,$(LOCAL_NODE_MODULES),\
      rm -rf node_modules/$(n) && \
      ln -s ../local_node_modules/$(n) node_modules/ && \
    ) \
   echo TODO: Remove silk-api special case... && \
   rm node_modules/silk-api && ln -fs ../local_node_modules/silk-api/dist/api node_modules/silk-api && \
   true
	cd $(LOCAL_PATH) && \
   git add node_modules

endif # ONE_SHOT_MAKEFILE

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
	$(hide) cd $(@D) && \
   rm -rf $(addprefix node_modules/,$(LOCAL_NODE_MODULES))
	$(hide) rsync -qav $(ABS_LOCAL_PATH)/ $(@D)
	@echo "Build: $@"
	$(hide) cd $(@D) && \
   node $(npm_cli) install --ignore-scripts --nodedir=$(npm_node_dir) --no-optional
	$(hide) cd $(@D) && \
   node $(npm_cli) rebuild --nodedir=$(npm_node_dir)
	$(hide) cd $(@D) && \
   node $(npm_cli) install --nodedir=$(npm_node_dir)
	$(hide) cd $(@D) && \
   $(foreach n,$(LOCAL_NODE_MODULES),\
      if [ -d node_modules/$(n)/node_modules ]; then \
        echo ; \
        echo Error: $(n) may not have any unique package dependencies; \
        echo Please add all dependencies to $(ABS_LOCAL_PATH)/package.json instead; \
        echo as package dependencies of local_node_modules are currently ignored; \
        echo ; \
        exit 1; \
      fi && \
    ) \
   true

$(LOCAL_INSTALLED_MODULE): $(LOCAL_BUILT_MODULE)
	@echo "Install: $@"
	$(hide) mkdir -p $(@D)
	$(hide) cp -r $< $@
# Locate and copy native bindings from /system/silk/build/<foo>.node
# so they can be resolved correctly from the browserify-ed silk.js node_modules
	$(hide) mkdir -p $(@D)/build
	$(hide) \
  for binding in `cd $(<D)/node_modules/ && find -L . -type f -name *.node -not -path "*/obj.target/*"`; do \
    cp -vf $(<D)/node_modules/$$binding $(@D)/build/`basename $$binding`; \
  done
