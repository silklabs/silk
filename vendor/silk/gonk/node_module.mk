#
# Builds a node-based npm module.
#
# Currently the following assumptions are made about the node module:
#
# 1. A package.json file exists in LOCAL_PATH
#
# 2. The LOCAL_MODULE variable is derived from the package.json "name" attribute
#
# 3. If LOCAL_NODE_MODULE_TYPE is defined to "file", the module is assumed to
#    be a "file module" and only the file (native or script) identified by the
#    package.json's "main" attribute will be installed.
#
# 4. LOCAL_MODULE_PATH maybe specified to control the installation location.
#    If unspecified the module will be installed as a system node module
#
# 5. Any external static/shared objects required by node-gyp-based bindings
#    should be listed in LOCAL_STATIC_LIBRARIES/LOCAL_SHARED_LIBRARIES to ensure
#    Make can managed dependencies probably.  These libraries will be passed to
#    bindings.gyp via environment variable Android_mk__LIBRARIES.
#
# 6. external/stlport/libstlport.mk is activated if an alternate STL is not
#    selected via Android.mk in the usage manner:
#              LOCAL_SDK_VERSION := 21
#              LOCAL_NDK_STL_VARIANT := gnustl_static
#

LOCAL_MODULE_CLASS := NPM
my_prefix := TARGET_

define GET_PACKAGE_NAME_MAIN_JS
var pkg = JSON.parse(require('fs').readFileSync('$(LOCAL_PATH)/package.json', 'utf8'));
console.log('LOCAL_MODULE=' + pkg.name);
console.log('LOCAL_NODE_MODULE_MAIN=' + (pkg.main || ''));
endef
$(foreach stmt,$(shell node -e "$(GET_PACKAGE_NAME_MAIN_JS)"),$(eval $(stmt)))

ifeq (,$(strip $(LOCAL_MODULE_TAGS)))
LOCAL_MODULE_TAGS := optional
endif

ifeq (,$(strip $(LOCAL_NODE_MODULE_TYPE)))
LOCAL_NODE_MODULE_TYPE := folder
endif

ifneq (1,$(words $(filter file folder,$(LOCAL_NODE_MODULE_TYPE))))
$(error Error: Invalid LOCAL_NODE_MODULE_TYPE: $(LOCAL_NODE_MODULE_TYPE))
endif

ifeq ($(strip $(LOCAL_MODULE_PATH)),)
# Global node module by default
LOCAL_MODULE_PATH := $(TARGET_OUT)/lib/node
endif

ifeq (folder,$(strip $(LOCAL_NODE_MODULE_TYPE)))
LOCAL_MODULE_PATH := $(LOCAL_MODULE_PATH)/$(LOCAL_MODULE)
else
ifeq (,$(strip $(LOCAL_NODE_MODULE_MAIN)))
$(error $(LOCAL_PATH)/package.json is missing a "main" attribute)
endif
endif

ifeq (,$(strip $(LOCAL_NDK_STL_VARIANT)))
include external/stlport/libstlport.mk
endif

# Shotgun approach to ensuring that the module is rebuilt when local source
# changes are made, as there's no NPM dependency information conveyed up to
# Make.
LOCAL_ADDITIONAL_DEPENDENCIES := $(shell find $(LOCAL_PATH) -type f)

LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_CUSTOM_INSTALLED_MODULE := true
LOCAL_BUILT_MODULE_STEM := package.json
ifeq (folder,$(strip $(LOCAL_NODE_MODULE_TYPE)))
LOCAL_INSTALLED_MODULE_STEM := package.json
else
LOCAL_MODULE_SUFFIX := $(suffix $(LOCAL_NODE_MODULE_MAIN))
endif

# LOCAL_ALLOW_UNDEFINED_SYMBOLS is needed to avoid unresolved v8/libuv/node
# symbols during node-gyp link
#
# TODO: Ideally this would be removed, as it will also obscure legit missing symbols
LOCAL_ALLOW_UNDEFINED_SYMBOLS=true

include $(BUILD_SYSTEM)/binary.mk

$(LOCAL_BUILT_MODULE): $(LOCAL_ADDITIONAL_DEPENDENCIES)
$(LOCAL_BUILT_MODULE): $(all_libraries)

npm_cli = $(abspath external/npm/cli.js)
npm_node_dir = $(abspath external/$(or $(NODE_ENGINE),node))

define abs_import_includes
  $(foreach i,$(1),$(if $(filter -I,$(i)),$(i),$(abspath $(i))))
endef
$(LOCAL_BUILT_MODULE): LOCAL_PATH := $(ANDROID_BUILD_TOP)/$(LOCAL_PATH)
$(LOCAL_BUILT_MODULE): $(import_includes)
	@echo "Mirror module to: $(@D)"
	$(hide) mkdir -p $(@D)
	$(hide) rsync -qav $(LOCAL_PATH)/ $(@D)
	$(hide) cd $(@D) && $(ANDROID_BUILD_TOP)/vendor/silk/locked_node_modules/fetch.sh
	@echo "Build: $@"
	$(hide) cd $(@D) &&  \
    C_INCLUDES="\
      $(addprefix -I ,$(abspath $(PRIVATE_C_INCLUDES))) \
      $(call abs_import_includes,$(shell cat $(PRIVATE_IMPORT_INCLUDES))) \
      $(addprefix -isystem ,\
          $(abspath $(if $(PRIVATE_NO_DEFAULT_COMPILER_FLAGS),, \
              $(filter-out $(PRIVATE_C_INCLUDES), \
                  $(PRIVATE_TARGET_PROJECT_INCLUDES) \
                  $(PRIVATE_TARGET_C_INCLUDES)))) \
          $(ANDROID_BUILD_TOP) \
        ) \
      " && \
    C_FLAGS="\
      $(if $(PRIVATE_NO_DEFAULT_COMPILER_FLAGS),, \
          $(PRIVATE_TARGET_GLOBAL_CFLAGS) \
          $(PRIVATE_ARM_CFLAGS) \
       ) \
      $(PRIVATE_CFLAGS) \
      $(PRIVATE_DEBUG_CFLAGS) \
      "\ && \
    CPP_FLAGS="\
      $(if $(PRIVATE_NO_DEFAULT_COMPILER_FLAGS),, \
          $(PRIVATE_TARGET_GLOBAL_CFLAGS) \
          $(PRIVATE_TARGET_GLOBAL_CPPFLAGS) \
          $(PRIVATE_ARM_CFLAGS) \
       ) \
      $(PRIVATE_RTTI_FLAG) \
      $(PRIVATE_CFLAGS) \
      $(PRIVATE_CPPFLAGS) \
      $(PRIVATE_DEBUG_CFLAGS) \
      "\ && \
    LD_FLAGS="\
      $(PRIVATE_LDFLAGS) \
      $(PRIVATE_LDLIBS) \
      $(TARGET_GLOBAL_LDFLAGS) \
      -B$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
      -L$(abspath $(TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
      "\ && \
    export NPM_CONFIG_ARCH=arm &&  \
    export NPM_CONFIG_PLATFORM=android && \
    export CC="$(abspath $(TARGET_CC)) $$C_INCLUDES $$C_FLAGS" && \
    export CXX="$(abspath $(TARGET_CXX)) $$C_INCLUDES $$CPP_FLAGS" && \
    export LINK="$(abspath $(TARGET_CXX)) $$LD_FLAGS" && \
    export AR="$(abspath $(TARGET_AR))" && \
    export RANLIB="$(abspath $(TARGET_RANLIB))" && \
    export Android_mk__LIBRARIES="-Wl,--start-group \
      $(abspath \
        $(PRIVATE_ALL_WHOLE_STATIC_LIBRARIES) \
        $(PRIVATE_ALL_STATIC_LIBRARIES) \
        $(PRIVATE_ALL_SHARED_LIBRARIES) \
      ) \
      -Wl,--end-group" && \
    node $(npm_cli) install --nodedir=$(npm_node_dir) #--loglevel silly
	$(hide) touch $@

$(LOCAL_INSTALLED_MODULE): LOCAL_NODE_MODULE_MAIN := $(LOCAL_NODE_MODULE_MAIN)
$(LOCAL_INSTALLED_MODULE): LOCAL_NODE_MODULE_TYPE := $(LOCAL_NODE_MODULE_TYPE)
$(LOCAL_INSTALLED_MODULE): $(LOCAL_BUILT_MODULE)
	@echo "Install: $@"
	$(hide) mkdir -p $(@D)
ifeq (file,$(strip $(LOCAL_NODE_MODULE_TYPE)))
	$(hide) cp $(<D)/$(LOCAL_NODE_MODULE_MAIN) $@
# Locate and copy all native modules to <LOCAL_MODULE_PATH>/build/<foo>.node
# so they can be resolved correctly from the browserify-ed module
	$(_hide) \
  for binding in `cd $(<D)/ && find -L . -type f -name *.node -not -path "*/obj.target/*"`; do \
    mkdir -p $(@D)/build; \
    cp -vf $(<D)/$$binding $(@D)/build/`basename $$binding`; \
  done
# <LOCAL_MODULE_PATH>/build/Release/<foo>.node is also a popular location for
# native modules so forge a symlink to redirect such a require() back to
# <LOCAL_MODULE_PATH>/build/<foo>.node
	$(hide) if [[ -d $(@D)/build ]]; then ln -fsT . $(@D)/build/Release; fi;
else
# For now just assume that all device node_module dependencies are already
# present somehow, so don't install all of node_modules/ (which likely also
# contains a bunch of development only tools).
# TODO: Maybe a better way would be to use the package.json's "files" section to
# determine what to install on device?
	$(hide) cp -r $(addprefix $(<D)/,$(filter-out node_modules,$(notdir $(wildcard $(<D)/*)))) $(@D)
	$(hide) touch $@
endif

