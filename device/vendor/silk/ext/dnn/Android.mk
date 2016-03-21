LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := dnn-googlenet-model
LOCAL_INSTALLED_MODULE_STEM := bvlc_googlenet.caffemodel
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/dnn/model/googlenet
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/bvlc_googlenet.caffemodel
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := dnn-googlenet-proto
LOCAL_INSTALLED_MODULE_STEM := deploy.prototxt
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/dnn/model/googlenet
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/deploy.prototxt
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := dnn-imagenet-mean
LOCAL_INSTALLED_MODULE_STEM := imagenet_mean.binaryproto
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/dnn/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/imagenet_mean.binaryproto
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := dnn-imagenet-dictionary
LOCAL_INSTALLED_MODULE_STEM := imagenet_dictionary.txt
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/dnn/model
LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/model/synset_words.txt
include $(BUILD_PREBUILT)

ifneq ($(ONE_SHOT_MAKEFILE),)
include $(LOCAL_PATH)/../ext.mk
$(eval $(call RENDER_EXTENSION_MK,$(LOCAL_PATH)))
endif
