LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := detectface-shape_predictor_68_face_landmarks
LOCAL_INSTALLED_MODULE_STEM := shape_predictor_68_face_landmarks.dat
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)

LOCAL_PREBUILT_MODULE_FILE := $(LOCAL_PATH)/shape_predictor_68_face_landmarks.dat
$(LOCAL_PREBUILT_MODULE_FILE): vendor/propsilk/dlib/shape_predictor_68_face_landmarks.dat
	ln $< $@

include $(BUILD_PREBUILT)

include $(CLEAR_VARS)
LOCAL_MODULE := detectface-cascade-frontalface
LOCAL_INSTALLED_MODULE_STEM := haarcascade_frontalface_alt2.xml
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK_MEDIA)/opencv
LOCAL_PREBUILT_MODULE_FILE := external/opencv3/data/haarcascades/haarcascade_frontalface_alt2.xml
include $(BUILD_PREBUILT)

ifneq ($(ONE_SHOT_MAKEFILE),)
include $(LOCAL_PATH)/../ext.mk
$(eval $(call RENDER_EXTENSION_MK,$(LOCAL_PATH)))
endif
