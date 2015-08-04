#
# Builds a node-based npm module.
#
# Currently the following assumptions are made about the node module:
#
# 1. The module may be either a file or folder module. If the module name ends
#    in .js, .node, or .json then it's assumed to be a file module, otherwise a
#    folder module.  To override define LOCAL_NODE_MODULE_TYPE to be either
#    "file" or "folder".
#
# 2. Any external shared objects required by node-gyp should be listed in
#    LOCAL_SHARED_LIBRARIES to ensure Make can managed dependencies probably.
#

LOCAL_MODULE_CLASS := NPM


# If the node module type is not specified, attempt to infer the type based on
# the module name
ifeq ($(strip $(LOCAL_NODE_MODULE_TYPE)),)
ifneq (,$(filter .js .node .json,$(suffix $(LOCAL_MODULE))))
LOCAL_NODE_MODULE_TYPE := file
else
LOCAL_NODE_MODULE_TYPE := folder
endif
endif

ifneq (,$(strip $(filter-out file folder,$(LOCAL_NODE_MODULE_TYPE))))
$(error Error: Invalid LOCAL_NODE_MODULE_TYPE: $(LOCAL_NODE_MODULE_TYPE))
endif

ifeq ($(strip $(LOCAL_MODULE_PATH)),)
# Global node module by default
LOCAL_MODULE_PATH := $(TARGET_OUT)/lib/node
ifeq (folder,$(strip $(LOCAL_NODE_MODULE_TYPE)))
LOCAL_MODULE_PATH := $(LOCAL_MODULE_PATH)/$(LOCAL_MODULE)
endif
endif

include external/stlport/libstlport.mk

npm_cli = $(abspath external/npm/cli.js)
npm_node_dir = $(abspath external/$(or $(NODE_ENGINE),node))

npm_CFLAGS := $(TARGET_GLOBAL_CFLAGS) \
  $(addprefix -isystem ,$(abspath . $(TARGET_C_INCLUDES))) \
  $(foreach inc,$(LOCAL_C_INCLUDES),-isystem $(abspath $(inc)))

npm_CPPFLAGS := $(TARGET_GLOBAL_CPPFLAGS)
npm_LDFLAGS := $(TARGET_GLOBAL_LDFLAGS) \
  -B$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
  -L$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) -lstlport

# Shotgun approach to ensuring that the module is rebuilt when local source
# changes are made, as there's no NPM dependency information conveyed up to
# Make.
LOCAL_ADDITIONAL_DEPENDENCIES := $(shell find $(LOCAL_PATH) -type f)

LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_CUSTOM_INSTALLED_MODULE := true
ifeq (folder,$(strip $(LOCAL_NODE_MODULE_TYPE)))
LOCAL_BUILT_MODULE_STEM := package.json
LOCAL_INSTALLED_MODULE_STEM := package.json
endif
include $(BUILD_PREBUILT)

$(LOCAL_BUILT_MODULE): export CC := $(abspath $(TARGET_CC)) $(npm_CFLAGS)
$(LOCAL_BUILT_MODULE): export CXX := $(abspath $(TARGET_CXX)) $(npm_CFLAGS) $(npm_CPPFLAGS)
$(LOCAL_BUILT_MODULE): export AR := $(abspath $(TARGET_AR))
$(LOCAL_BUILT_MODULE): export RANLIB := $(abspath $(TARGET_RANLIB))
$(LOCAL_BUILT_MODULE): export LINK := $(abspath $(TARGET_CXX)) $(npm_LDFLAGS)
$(LOCAL_BUILT_MODULE): LOCAL_PATH := $(ANDROID_BUILD_TOP)/$(LOCAL_PATH)
$(LOCAL_BUILT_MODULE): export NPM_CONFIG_ARCH=arm
$(LOCAL_BUILT_MODULE): export NPM_CONFIG_PLATFORM=android

$(LOCAL_BUILT_MODULE):
	@echo "Mirror module to: $(@D)"
	$(hide) mkdir -p $(@D)
	$(hide) rsync -qav $(LOCAL_PATH)/ $(@D)
	$(hide) cd $(@D) && $(ANDROID_BUILD_TOP)/vendor/silk/locked_node_modules/fetch.sh
	@echo "Build: $@"
	$(hide) cd $(@D) && \
   node $(npm_cli) install --nodedir=$(npm_node_dir)
ifeq (folder,$(strip $(LOCAL_NODE_MODULE_TYPE)))
	$(hide) touch $@
endif

$(LOCAL_INSTALLED_MODULE): $(LOCAL_BUILT_MODULE)
	@echo "Install: $@"
	$(hide) mkdir -p $(@D)
ifeq (file,$(strip $(LOCAL_NODE_MODULE_TYPE)))
	$(hide) cp -r $< $@
# Locate and copy all native modules to <LOCAL_MODULE_PATH>/build/<foo>.node
# so they can be resolved correctly from the browserify-ed module
	$(hide) \
  for binding in `cd $(<D)/node_modules/ && find -L . -type f -name *.node -not -path "*/obj.target/*"`; do \
    mkdir -p $(@D)/build; \
    cp -vf $(<D)/node_modules/$$binding $(@D)/build/`basename $$binding`; \
  done
# <LOCAL_MODULE_PATH>/build/Release/<foo>.node is also a popular location for
# native modules so forge a symlink to redirect such a require() back to
# <LOCAL_MODULE_PATH>/build/<foo>.node
	$(hide) if [[ -d $(@D)/build ]]; then ln -fsT . $(@D)/build/Release; fi;
else
	$(hide) cp -r $(<D)/* $(@D)
	$(hide) touch $@
endif

