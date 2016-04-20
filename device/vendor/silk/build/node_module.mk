# Builds a node-based npm module.
#
# Currently the following assumptions are made about the node module:
#
# 1. A package.json file exists in LOCAL_PATH.
#
# 2. The LOCAL_MODULE variable is derived from the package.json "name" attribute
#    if it is not explicitly defined.
#
# 3. If the file .silkignore exists, it will be used to filter out files
#    during the device installation.  The format is identical to .gitignore.  If
#    .silkignore doesn't exist then all module files (including
#    node_modules/**/*) will be installed on device.
#
# 4. LOCAL_MODULE_PATH maybe specified to control the installation location.
#    If unspecified the module will be installed as a system node module.
#
# 5. Any external static/shared objects required by node-gyp-based bindings
#    should be listed in LOCAL_STATIC_LIBRARIES/LOCAL_SHARED_LIBRARIES to ensure
#    Make can manage dependencies properly.  These libraries will be passed to
#    bindings.gyp via the environment variable Android_mk__LIBRARIES.
#
# 6. stlport_shared is the default STL if an alternate STL is not
#    selected via Android.mk:
#              LOCAL_SDK_VERSION := 19
#              LOCAL_NDK_STL_VARIANT := gnustl_static
#

LOCAL_MODULE_CLASS := NPM
my_prefix := TARGET_

define GET_PACKAGE_NAME_MAIN_JS
var pkg = JSON.parse(require('fs').readFileSync('$(LOCAL_PATH)/package.json', 'utf8'));
console.log('LOCAL_MODULE=$(or $(LOCAL_MODULE),' + pkg.name + ')');
console.log('LOCAL_NODE_MODULE_MAIN=' + (pkg.main || ''));
endef
$(foreach stmt,$(shell node -e "$(GET_PACKAGE_NAME_MAIN_JS)"),$(eval $(stmt)))

ifeq (,$(strip $(LOCAL_MODULE_TAGS)))
LOCAL_MODULE_TAGS := optional
endif

ifeq (,$(strip $(LOCAL_NODE_MODULE_TYPE)))
LOCAL_NODE_MODULE_TYPE := folder
endif
LOCAL_NODE_MODULE_TYPE := $(strip $(LOCAL_NODE_MODULE_TYPE))

ifneq (1,$(words $(filter file folder,$(LOCAL_NODE_MODULE_TYPE))))
$(error Error: Invalid LOCAL_NODE_MODULE_TYPE: $(LOCAL_NODE_MODULE_TYPE))
endif

ifneq (folder,$(LOCAL_NODE_MODULE_TYPE))
# LOCAL_NODE_MODULE_TYPE is deprecated, please don't use it
$(warning $(LOCAL_MODULE) is using LOCAL_NODE_MODULE_TYPE)
endif

ifeq ($(strip $(LOCAL_MODULE_PATH)),)
# Global node module by default
LOCAL_MODULE_PATH := $(TARGET_OUT_SILK_NODE_MODULES)
endif

ifeq (folder,$(LOCAL_NODE_MODULE_TYPE))
LOCAL_MODULE_PATH := $(LOCAL_MODULE_PATH)/$(LOCAL_MODULE)
else
ifeq (,$(strip $(LOCAL_NODE_MODULE_MAIN)))
$(error $(LOCAL_PATH)/package.json is missing a "main" attribute)
endif
endif

ifneq ($(TARGET_GE_MARSHMALLOW),)
# M-era default STL handling
ifeq (,$(strip $(LOCAL_SDK_VERSION)))
LOCAL_SDK_VERSION := 21
endif
ifeq (,$(strip $(LOCAL_NDK_STL_VARIANT)))
LOCAL_NDK_STL_VARIANT := stlport_shared
endif
else
# L-era default STL handling
ifeq (,$(strip $(LOCAL_NDK_STL_VARIANT)))
include external/stlport/libstlport.mk
endif
endif

# Shotgun approach to ensuring that the module is rebuilt when local source
# changes are made, as there's no NPM dependency information conveyed up to
# Make.
#
# Specific "known bad" subdirectories are excluded.  These directories contain
# files with characters such as '-', ''', and ' ' that generate invalid
# dependencies.
LOCAL_ADDITIONAL_DEPENDENCIES := $(shell find $(LOCAL_PATH) -type f \
  ! -regex '.*/node_modules/babel/test/fixtures/.*' \
  ! -regex '.*/node_modules/gulp-match/Rob.*' \
  ! -regex '.*/dlib/.*' \
)

LOCAL_32_BIT_ONLY := true
LOCAL_SHARED_LIBRARIES += liblog
LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_CUSTOM_INSTALLED_MODULE := true
ifeq (folder,$(LOCAL_NODE_MODULE_TYPE))
LOCAL_BUILT_MODULE_STEM := package.json
LOCAL_INSTALLED_MODULE_STEM := package.json
else
LOCAL_BUILT_MODULE_STEM := $(LOCAL_NODE_MODULE_MAIN)
LOCAL_INSTALLED_MODULE_STEM := $(notdir $(LOCAL_MODULE))$(suffix $(LOCAL_NODE_MODULE_MAIN))
endif

# LOCAL_ALLOW_UNDEFINED_SYMBOLS is needed to avoid unresolved v8/libuv/node
# symbols during node-gyp link
#
# TODO: Ideally this would be removed, as it will also obscure legit missing symbols
LOCAL_ALLOW_UNDEFINED_SYMBOLS=true

# If the 2nd arch exists assume it's 32bit and select it
ifdef TARGET_2ND_ARCH
LOCAL_2ND_ARCH_VAR_PREFIX := $(TARGET_2ND_ARCH_VAR_PREFIX)
endif

include $(BUILD_SYSTEM)/binary.mk

$(LOCAL_BUILT_MODULE): built_module_path := $(built_module_path)
$(LOCAL_BUILT_MODULE): $(LOCAL_ADDITIONAL_DEPENDENCIES)
$(LOCAL_BUILT_MODULE): $(all_libraries)

npm_cli = $(abspath external/npm/cli.js)
npm_node_dir = $(abspath external/node)

define abs_import_includes
  $(foreach i,$(1),$(if $(filter -I,$(i)),$(i),$(abspath $(i))))
endef
$(LOCAL_BUILT_MODULE): LOCAL_2ND_ARCH_VAR_PREFIX := $(LOCAL_2ND_ARCH_VAR_PREFIX)
$(LOCAL_BUILT_MODULE): LOCAL_PATH := $(abspath $(LOCAL_PATH))
$(LOCAL_BUILT_MODULE): my_ndk_sysroot_lib := $(my_ndk_sysroot_lib)
$(LOCAL_BUILT_MODULE): $(import_includes)
	@echo "Mirror module to: $(built_module_path)"
	@echo "            from: $(LOCAL_PATH)"
	$(hide) mkdir -p $(built_module_path)
	$(hide) rsync -qa --exclude='/node_modules' --exclude='/.silkslug' $(LOCAL_PATH)/ $(built_module_path)
	$(hide) cd $(built_module_path) && $(ANDROID_BUILD_TOP)/vendor/silk/build/package_abs_file.js package.json $(LOCAL_PATH)/
	$(hide) cd $(built_module_path) && $(ANDROID_BUILD_TOP)/vendor/silk/locked_node_modules/fetch.sh
	@echo "Build: $(built_module_path)"
	$(hide) cd $(built_module_path) &&  \
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
      $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_GLOBAL_LDFLAGS) \
      -B$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
      $(and $(my_ndk_sysroot_lib),-L$(abspath $(my_ndk_sysroot_lib))) \
      -L$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
      "\ && \
		export SILK_ALLOW_REBUILD_FAIL=1 \
    export V=$(if $(SHOW_COMMANDS),1) \
    export BUILD_FINGERPRINT="$(BUILD_FINGERPRINT)" &&  \
    export TARGET_OUT_HEADERS="$(TARGET_OUT_HEADERS)" &&  \
    export NPM_CONFIG_ARCH=$(or $(TARGET_2ND_ARCH),$(TARGET_ARCH)) &&  \
    export NPM_CONFIG_PLATFORM=android && \
    export CC="$(abspath $(my_cc_wrapper) $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_CC)) $$C_INCLUDES $$C_FLAGS" && \
    export CXX="$(abspath $(my_cc_wrapper) $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_CXX)) $$C_INCLUDES $$CPP_FLAGS" && \
    export LINK="$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_CXX)) $$LD_FLAGS" && \
    export AR="$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_AR))" && \
    export RANLIB="$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_RANLIB))" && \
    export Android_mk__LIBRARIES="-Wl,--start-group \
      $(abspath \
        $(PRIVATE_ALL_WHOLE_STATIC_LIBRARIES) \
        $(PRIVATE_ALL_STATIC_LIBRARIES) \
        $(PRIVATE_ALL_SHARED_LIBRARIES) \
      ) \
      -Wl,--end-group" && \
    node $(npm_cli) install --production --nodedir=$(npm_node_dir) #--loglevel silly
ifeq (folder,$(LOCAL_NODE_MODULE_TYPE))
	$(hide) touch $@
endif

ifeq (file,$(LOCAL_NODE_MODULE_TYPE))

$(LOCAL_INSTALLED_MODULE): PRIVATE_STRIP := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_STRIP)
$(LOCAL_INSTALLED_MODULE): PRIVATE_OBJCOPY := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_OBJCOPY)
$(LOCAL_INSTALLED_MODULE): built_module_path := $(built_module_path)

# Binary file module
ifeq ($(suffix $(LOCAL_NODE_MODULE_MAIN)),.node)

$(LOCAL_INSTALLED_MODULE): PRIVATE_UNSTRIPPED_MODULE := \
  $(TARGET_OUT_UNSTRIPPED)/$(patsubst $(PRODUCT_OUT)/%,%,$(LOCAL_INSTALLED_MODULE))

$(LOCAL_INSTALLED_MODULE): $(LOCAL_BUILT_MODULE) | $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_STRIP)
	$(transform-to-stripped)
	@echo target Symbolic: $(PRIVATE_UNSTRIPPED_MODULE)
	$(hide) mkdir -p $(dir $(PRIVATE_UNSTRIPPED_MODULE))
	$(hide) cp $< $(PRIVATE_UNSTRIPPED_MODULE)


# Javascript file module (that may include binary submodules)
else

$(LOCAL_INSTALLED_MODULE): PRIVATE_UNSTRIPPED_PATH := \
  $(TARGET_OUT_UNSTRIPPED)/$(patsubst $(PRODUCT_OUT)/%,%,$(dir $(LOCAL_INSTALLED_MODULE)))

$(LOCAL_INSTALLED_MODULE): $(LOCAL_BUILT_MODULE) | $(ACP) $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_STRIP)
	$(copy-file-to-target)
# Install source maps if they where generated...
	$(hide) test $(TARGET_BUILD_VARIANT) != user -a -f $<.map && $(ACP) $<.map $@.map || echo "Skip sourcemap $@.map"
# Locate and copy all native modules to <LOCAL_MODULE_PATH>/build/<foo>.node
# so they can be resolved correctly from the browserify-ed module
	$(hide) \
  for binding in `cd $(built_module_path)/ && find -L . -type f -name *.node -not -path "*/obj.target/*"`; do \
    mkdir -p $(@D)/build; \
    SRC=$(built_module_path)/$$binding ; \
    DST=$(@D)/build/`basename $$binding` ; \
    $(PRIVATE_STRIP) --strip-all $$SRC -o $$DST ; \
    $(and $(TARGET_STRIP_EXTRA), $(PRIVATE_OBJCOPY) --add-gnu-debuglink=$$SRC $$DST ; ) \
    mkdir -p $(PRIVATE_UNSTRIPPED_PATH)/build ; \
    cp -v $$SRC $(PRIVATE_UNSTRIPPED_PATH)/build/`basename $$binding` ; \
  done

endif # .js module

else # LOCAL_NODE_MODULE_TYPE == folder
$(LOCAL_INSTALLED_MODULE): $(LOCAL_BUILT_MODULE)
	@echo "Install: $@"
	$(hide) mkdir -p $(@D)
	$(hide) rsync -qa $(firstword $(wildcard $(<D)/.silkslug/ $(<D)/)) $(@D)
	$(hide) test -f $@
endif

LOCAL_2ND_ARCH_VAR_PREFIX :=
