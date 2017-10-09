# Builds a node-based npm module.
#
# Currently the following assumptions are made about the node module:
#
# 1. A package.json file exists in LOCAL_PATH.
#
# 2. The LOCAL_MODULE variable is derived from the package.json "name" attribute
#    if it is not explicitly defined.
#
# 3. LOCAL_MODULE_PATH maybe specified to control the installation location.
#    If unspecified the module will be installed as a system node module.
#
# 4. Any external static/shared objects required by node-gyp-based bindings
#    should be listed in LOCAL_STATIC_LIBRARIES/LOCAL_SHARED_LIBRARIES to ensure
#    Make can manage dependencies properly.  These libraries will be passed to
#    bindings.gyp via the environment variable Android_mk__LIBRARIES.
#
# 5. stlport_shared is the default STL if an alternate STL is not
#    selected via Android.mk:
#              LOCAL_SDK_VERSION := 21
#              LOCAL_NDK_STL_VARIANT := gnustl_static
#
#    Alternatively define LOCAL_NODE_MODULE_NO_SDK_VERSION to request no NDK
#    STL, which can be useful when a module uses in non-NDK system libraries
#

node_modules_mk_dir := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))

LOCAL_MODULE_CLASS := NPM
my_prefix := TARGET_

define GET_PACKAGE_NAME_MAIN_JS
var pkg = JSON.parse(require('fs').readFileSync('$(LOCAL_PATH)/package.json', 'utf8'));
console.log('LOCAL_MODULE=$(or $(LOCAL_MODULE),' + pkg.name + ')');
var main = pkg.main || 'index.js';
main += (!require('path').extname(main)) ? '.js' : '';
console.log('LOCAL_NODE_MODULE_MAIN=$(or $(LOCAL_NODE_MODULE_MAIN),' + main + ')');
endef

define CHECK_FOR_SILK_BUILD
var pkg = JSON.parse(require('fs').readFileSync('$(LOCAL_PATH)/package.json', 'utf8'));
console.log(!!(pkg.scripts && pkg.scripts['silk-build-gonk']) ? 1 : 0);
endef

$(foreach stmt,$(shell node -e "$(GET_PACKAGE_NAME_MAIN_JS)"),$(eval $(stmt)))

ifeq (,$(strip $(LOCAL_MODULE_TAGS)))
LOCAL_MODULE_TAGS := optional
endif

ifeq ($(strip $(LOCAL_MODULE_PATH)),)
# Global node module by default
LOCAL_MODULE_PATH := $(TARGET_OUT_SILK_NODE_MODULES)
endif

ifeq (,$(strip $(LOCAL_NODE_MODULE_MAIN)))
$(error $(LOCAL_PATH)/package.json is missing a "main" attribute)
endif

ifneq ($(LOCAL_NODE_MODULE_NO_SDK_VERSION),)
# Don't fiddle with LOCAL_SDK_VERSION/LOCAL_NDK_STL_VARIANT
else ifneq ($(TARGET_GE_MARSHMALLOW),)
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
# But exclude filepaths with characters that give Make trouble (TODO: properly
# escape these instead)
LOCAL_ADDITIONAL_DEPENDENCIES := $(shell find -L $(LOCAL_PATH) -type f \
  ! -regex '.*[ :].*' \
)

LOCAL_32_BIT_ONLY := true
LOCAL_SHARED_LIBRARIES += liblog
LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_CUSTOM_INSTALLED_MODULE := true
LOCAL_BUILT_MODULE_STEM := dist
LOCAL_INSTALLED_MODULE_STEM :=

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


npm_node_dir = $(abspath external/node)
buildjs_dir := $(abspath $(node_modules_mk_dir)/../../../../buildjs)

npm_has_silk_build := $(shell node -e "$(CHECK_FOR_SILK_BUILD)")
ifeq (1,$(npm_has_silk_build))
node_module_build_cmd = npm run silk-build-gonk
else
node_module_build_cmd = $(buildjs_dir)/bin/build
endif

ifdef LOCAL_SDK_VERSION
my_target_crtbegin_so_o := $(wildcard $(my_ndk_sysroot_lib)/crtbegin_so.o)
my_target_crtend_so_o := $(wildcard $(my_ndk_sysroot_lib)/crtend_so.o)
else
my_target_crtbegin_so_o := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_CRTBEGIN_SO_O)
my_target_crtend_so_o := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_CRTEND_SO_O)
endif
my_target_libatomic := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_LIBATOMIC)
my_target_libgcc := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_LIBGCC)

LOCAL_BUILT_MODULE_MAIN_PATH := $(LOCAL_BUILT_MODULE)/$(LOCAL_NODE_MODULE_MAIN)

$(LOCAL_BUILT_MODULE_MAIN_PATH): LOCAL_2ND_ARCH_VAR_PREFIX := $(LOCAL_2ND_ARCH_VAR_PREFIX)
$(LOCAL_BUILT_MODULE_MAIN_PATH): LOCAL_NODE_MODULE_MAIN := $(LOCAL_NODE_MODULE_MAIN)
$(LOCAL_BUILT_MODULE_MAIN_PATH): LOCAL_PATH := $(LOCAL_PATH)
$(LOCAL_BUILT_MODULE_MAIN_PATH): LOCAL_BUILT_MODULE := $(LOCAL_BUILT_MODULE)
$(LOCAL_BUILT_MODULE_MAIN_PATH): my_ndk_sysroot_lib := $(my_ndk_sysroot_lib)
$(LOCAL_BUILT_MODULE_MAIN_PATH): $(import_includes)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_IMPORT_INCLUDES := $(import_includes)
$(LOCAL_BUILT_MODULE_MAIN_PATH): $(my_target_crtbegin_so_o) $(my_target_crtend_so_o)
$(LOCAL_BUILT_MODULE_MAIN_PATH): node_module_build_cmd := $(node_module_build_cmd)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_CRTBEGIN_SO_O := $(abspath $(my_target_crtbegin_so_o))
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_CRTEND_SO_O := $(abspath $(my_target_crtend_so_o))
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_LIBATOMIC := $(my_target_libatomic)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_LIBGCC := $(my_target_libgcc)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_C_INCLUDES := $(my_c_includes)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_CFLAGS := $(my_cflags)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_CPPFLAGS := $(my_cppflags)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_DEBUG_CFLAGS := $(debug_cflags)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_RTTI_FLAG := $(LOCAL_RTTI_FLAG)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_LDFLAGS := $(my_ldflags)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_LDLIBS := $(LOCAL_LDLIBS)
$(LOCAL_BUILT_MODULE_MAIN_PATH): $(LOCAL_ADDITIONAL_DEPENDENCIES)
$(LOCAL_BUILT_MODULE_MAIN_PATH): $(all_libraries)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_NO_DEFAULT_COMPILER_FLAGS := \
    $(strip $(LOCAL_NO_DEFAULT_COMPILER_FLAGS))
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_PROJECT_INCLUDES := $(my_target_project_includes)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_C_INCLUDES := $(my_target_c_includes)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_GLOBAL_CFLAGS := $(my_target_global_cflags)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_GLOBAL_CPPFLAGS := $(my_target_global_cppflags)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_TARGET_GLOBAL_LDFLAGS := $(my_target_global_ldflags)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_ALL_SHARED_LIBRARIES := $(built_shared_libraries)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_ALL_STATIC_LIBRARIES := $(built_static_libraries)
$(LOCAL_BUILT_MODULE_MAIN_PATH): PRIVATE_ALL_WHOLE_STATIC_LIBRARIES := $(built_whole_libraries)
$(LOCAL_BUILT_MODULE_MAIN_PATH):
	@echo "NPM Install: $(LOCAL_PATH)"
	$(hide) cd $(LOCAL_PATH) &&  \
    C_INCLUDES="\
      $(addprefix -I ,$(abspath $(PRIVATE_C_INCLUDES))) \
      $$(sed -e 's#^-I \([^/]\)#-I $(ANDROID_BUILD_TOP)/\1#' $(abspath $(PRIVATE_IMPORT_INCLUDES)) | tr '\r\n' '  ') \
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
       ) \
      $(PRIVATE_CFLAGS) \
      $(PRIVATE_DEBUG_CFLAGS) \
      "\ && \
    CPP_FLAGS="\
      $(if $(PRIVATE_NO_DEFAULT_COMPILER_FLAGS),, \
          $(PRIVATE_TARGET_GLOBAL_CFLAGS) \
          $(PRIVATE_TARGET_GLOBAL_CPPFLAGS) \
       ) \
      $(PRIVATE_RTTI_FLAG) \
      $(PRIVATE_CFLAGS) \
      $(PRIVATE_CPPFLAGS) \
      $(PRIVATE_DEBUG_CFLAGS) \
      "\ && \
    LD_FLAGS="\
      -nostdlib \
      $(PRIVATE_LDFLAGS) \
      $(PRIVATE_LDLIBS) \
      $(PRIVATE_TARGET_GLOBAL_LDFLAGS) \
      -B$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
      $(and $(my_ndk_sysroot_lib),-L$(abspath $(my_ndk_sysroot_lib))) \
      $(PRIVATE_TARGET_CRTBEGIN_SO_O) \
      -L$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_OUT_INTERMEDIATE_LIBRARIES)) \
      "\ && \
		export SILK_ALLOW_REBUILD_FAIL=1 \
    export V=$(if $(SHOW_COMMANDS),1) \
    export JOBS=max \
    export BUILD_FINGERPRINT="$(BUILD_FINGERPRINT)" &&  \
    export TARGET_OUT_HEADERS="$(TARGET_OUT_HEADERS)" &&  \
    export SILK_GYP_FLAGS='-f make-android -DOS=android -Darch=$(or $(TARGET_2ND_ARCH),$(TARGET_ARCH))' && \
    export SILK_NODE_GYP_FLAGS='--arch=$(or $(TARGET_2ND_ARCH),$(TARGET_ARCH))' && \
    export npm_config_nodedir=$(npm_node_dir) && \
    export CC="$(abspath $(my_cc)) $$C_INCLUDES $$C_FLAGS" && \
    export CXX="$(abspath $(my_cxx)) $$C_INCLUDES $$CPP_FLAGS" && \
    export LINK="$(abspath $(my_cxx)) $$LD_FLAGS" && \
    export AR="$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_AR))" && \
    export RANLIB="$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_RANLIB))" && \
    export Android_mk__LIBRARIES="-Wl,--start-group \
      $(abspath \
        $(PRIVATE_ALL_WHOLE_STATIC_LIBRARIES) \
        $(PRIVATE_ALL_STATIC_LIBRARIES) \
        $(PRIVATE_ALL_SHARED_LIBRARIES) \
        $(PRIVATE_TARGET_LIBATOMIC) \
        $(PRIVATE_TARGET_LIBGCC) \
        $(PRIVATE_TARGET_CRTEND_SO_O) \
      ) \
      -Wl,--end-group" && \
     $(node_module_build_cmd) $(abspath $(LOCAL_PATH)) $(abspath $(LOCAL_BUILT_MODULE))

$(LOCAL_BUILT_MODULE): $(LOCAL_BUILT_MODULE_MAIN_PATH)

LOCAL_INSTALLED_MODULE_MAIN := $(LOCAL_INSTALLED_MODULE)/$(LOCAL_NODE_MODULE_MAIN)

$(LOCAL_INSTALLED_MODULE): $(LOCAL_INSTALLED_MODULE_MAIN)

$(LOCAL_INSTALLED_MODULE_MAIN): LOCAL_PATH := $(LOCAL_PATH)
$(LOCAL_INSTALLED_MODULE_MAIN): PRIVATE_STRIP := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_STRIP)
$(LOCAL_INSTALLED_MODULE_MAIN): PRIVATE_OBJCOPY := $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_OBJCOPY)
$(LOCAL_INSTALLED_MODULE_MAIN): PRIVATE_UNSTRIPPED_PATH := \
  $(TARGET_OUT_UNSTRIPPED)/$(patsubst $(PRODUCT_OUT)/%,%,$(dir $(LOCAL_INSTALLED_MODULE)))
$(LOCAL_INSTALLED_MODULE_MAIN): LOCAL_NODE_MODULE_MAIN := $(LOCAL_NODE_MODULE_MAIN)
$(LOCAL_INSTALLED_MODULE_MAIN): LOCAL_BUILT_MODULE := $(LOCAL_BUILT_MODULE)
$(LOCAL_INSTALLED_MODULE_MAIN): LOCAL_INSTALLED_MODULE := $(LOCAL_INSTALLED_MODULE)
$(LOCAL_INSTALLED_MODULE_MAIN): LOCAL_INSTALLED_MODULE_MAIN := $(LOCAL_INSTALLED_MODULE_MAIN)
ifeq ($(TARGET_BUILD_VARIANT),user)
$(LOCAL_INSTALLED_MODULE_MAIN): EXCLUDE_SOURCE_MAPS := --exclude *.js.map
endif
$(LOCAL_INSTALLED_MODULE_MAIN): $(LOCAL_BUILT_MODULE_MAIN_PATH)
	$(hide) \
  for binding in `cd $(LOCAL_BUILT_MODULE)/ && find -L . -type f -name *.node -not -path "*/obj.target/*"`; do \
    mkdir -p $(LOCAL_INSTALLED_MODULE)/build/Release && \
    SRC=$(LOCAL_BUILT_MODULE)/$$binding && \
    DST=$(LOCAL_INSTALLED_MODULE)/build/Release/`basename $$binding` && \
    $(PRIVATE_STRIP) --strip-all $$SRC -o $$DST \
    $(and $(TARGET_STRIP_EXTRA), && $(PRIVATE_OBJCOPY) --add-gnu-debuglink=$$SRC $$DST) ; \
  done
	@echo "Install: $(LOCAL_INSTALLED_MODULE)"
	$(hide) mkdir -p $(LOCAL_INSTALLED_MODULE)
	$(hide) rsync --exclude build/Release --exclude build/Debug $(EXCLUDE_SOURCE_MAPS) -qa $(LOCAL_BUILT_MODULE)/* $(LOCAL_INSTALLED_MODULE)
	$(hide) test -f $(LOCAL_INSTALLED_MODULE_MAIN)

LOCAL_2ND_ARCH_VAR_PREFIX :=
