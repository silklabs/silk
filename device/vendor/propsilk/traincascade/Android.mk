include $(CLEAR_VARS)
LOCAL_MODULE := traincascade
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC

# opencv training tools require that the commands to be run from the same location
# as the training data set
LOCAL_MODULE_PATH  := $(TARGET_OUT_DATA)/silk/opencv

LOCAL_PREBUILT_MODULE_FILE := vendor/silk/traincascade/traincascade
include $(BUILD_PREBUILT)
