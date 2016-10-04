LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE_CLASS := NPM
my_prefix := TARGET_

LOCAL_MODULE := node-webrtc
LOCAL_MODULE_TAGS := optional
LOCAL_MODULE_CLASS := STATIC_LIBRARIES
LOCAL_MODULE_SUFFIX := .node
LOCAL_CLANG := true
LOCAL_UNINSTALLABLE_MODULE := true
LOCAL_CUSTOM_BUILT_MODULE := true
LOCAL_SDK_VERSION := 21
LOCAL_32_BIT_ONLY := true

include $(BUILD_SYSTEM)/binary.mk

# If the 2nd arch exists assume it's 32bit and select it
ifdef TARGET_2ND_ARCH
LOCAL_2ND_ARCH_VAR_PREFIX := $(TARGET_2ND_ARCH_VAR_PREFIX)
GYP_VAR_PREFIX := $(TARGET_2ND_ARCH_VAR_PREFIX)
endif

# We need to override these in a very brute force way this variable always gets
# appended to the cflag strings without messing with the other flags.
cflag_overrides = "-Wno-non-virtual-dtor"

webrtc := $(ANDROID_BUILD_TOP)/external/silk-webrtc/
webrtc_makefile := $(webrtc)GypAndroid.mk
nodewebrtc := $(webrtc)third_party/node-webrtc

$(nodewebrtc):
	ln -sf $(abspath $(LOCAL_PATH)) $(nodewebrtc)

#$(error $(ANDROID_BUILD_TOP))
$(webrtc_makefile): LOCAL_PATH := $(abspath $(LOCAL_PATH))
$(webrtc_makefile): $(nodewebrtc)
	cd $(nodewebrtc);
	export CC="$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_CC))" && \
	export CXX="$(abspath $($(LOCAL_2ND_ARCH_VAR_PREFIX)TARGET_CXX))" && \
	export GYP_DEFINES="host_arch=x86 target_arch=arm OS=android _toolset=true" && \
	export GYP_GENERATORS="$(realpath $(ANDROID_BUILD_TOP)/../)/gyp/android.py" && \
	cd $(webrtc) && \
 	./webrtc/build/gyp_webrtc \
	--depth $(webrtc) \
	-Dvisibility=default \
	-Dnode_root_dir=$(ANDROID_BUILD_TOP)/external/node \
	-Dandroid_build_top=$(ANDROID_BUILD_TOP) \
	-Dnodewebrtc_gyp_webrtc_root='../../webrtc' \
	-Dnodewebrtc_webrtc_root='$(webrtc)' \
	-Dnode_webrtc_root_dir=$(LOCAL_PATH) \
	-Dandroid_webview_build=1 \
	-Dnodewebrtc_js_dest=$(ANDROID_BUILD_TOP)/$(TARGET_OUT_SILK_NODE_MODULES)/node-webrtc \
	-Dwerror= \
	-Dclang=1 \
	-Dinclude_opus=1 \
	-Dbuild_libvpx=1 \
	-Denable_protobuf=0 \
	-Ddesktop_capture_supported=0 \
	-Dclang_use_chrome_plugins=0 \
	-Dandroid_ndk_sysroot=$(HISTORICAL_NDK_VERSIONS_ROOT)/current/platforms/android-21/arch-arm \
	-Dandroid_ndk_headers=$(ANDROID_BUILD_TOP)/ndk \
	-Dandroid_ndk_sources=../../../../../../ndk \
	-Dandroid_ndk_root=$(HISTORICAL_NDK_VERSIONS_ROOT)/current \
	-Ddebug_extra_cflags=$(cflag_overrides) \
	-Drelease_extra_cflags=$(cflag_overrides) \
	-Dmodule_name=node-webrtc \
	-Drtc_use_h264=1 \
	-Duse_openh264=1 \
	-Dinclude_tests=0 \
	-Dchromium_code=0 \
	-Dbuild_with_chromium=0 \
	-Daudio_device_gonk__bytesPerSample=$(shell node -p "require('silk-config').deviceMic.bytesPerSample") \
	-Daudio_device_gonk__numChannels=$(shell node -p "require('silk-config').deviceMic.numChannels") \
	-Daudio_device_gonk__sampleRate=$(shell node -p "require('silk-config').deviceMic.sampleRate") \
	--no-parallel \
	third_party/node-webrtc/binding.gyp \
	-R node-webrtc

$(LOCAL_BUILT_MODULE): $(webrtc_makefile)
LOCAL_2ND_ARCH_VAR_PREFIX :=

# Only include node-webrtc if webrtc is present in the build workspace
include $(if $(wildcard $(webrtc)),$(webrtc_makefile))
