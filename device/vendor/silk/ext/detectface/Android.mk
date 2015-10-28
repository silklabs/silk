LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := detectface-cascade-eye
LOCAL_INSTALLED_MODULE_STEM := haarcascade_eye.xml
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/opencv
LOCAL_PREBUILT_MODULE_FILE := external/opencv2/data/haarcascades/haarcascade_eye.xml
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := detectface-cascade-eyeglasses
LOCAL_INSTALLED_MODULE_STEM := haarcascade_eye_tree_eyeglasses.xml
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/opencv
LOCAL_PREBUILT_MODULE_FILE := external/opencv2/data/haarcascades/haarcascade_eye_tree_eyeglasses.xml
include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := detectface-cascade-frontalface
LOCAL_INSTALLED_MODULE_STEM := haarcascade_frontalface_alt2.xml
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/opencv
LOCAL_PREBUILT_MODULE_FILE := external/opencv2/data/haarcascades/haarcascade_frontalface_alt2.xml
include $(BUILD_PREBUILT)

ifneq ($(ONE_SHOT_MAKEFILE),)
include $(LOCAL_PATH)/../ext.mk
$(eval $(call RENDER_EXTENSION_MK,$(LOCAL_PATH)))
endif
