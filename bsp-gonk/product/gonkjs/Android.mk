ifndef PRODUCT_GONKJS_ANDROID_MK
PRODUCT_GONKJS_ANDROID_MK=1

LOCAL_PATH:= $(call my-dir)

SILK_BOARD_PROP := board/$(SILK_BOARD)/board.prop
ifneq (,$(wildcard $(SILK_BOARD_PROP)))
include $(CLEAR_VARS)
LOCAL_MODULE := silk-board-prop
LOCAL_INSTALLED_MODULE_STEM := board.prop
LOCAL_MODULE_TAGS  := optional
LOCAL_MODULE_CLASS := ETC
LOCAL_MODULE_PATH  := $(TARGET_OUT_SILK)
LOCAL_PREBUILT_MODULE_FILE := $(SILK_BOARD_PROP)
include $(BUILD_PREBUILT)
endif

endif #PRODUCT_GONKJS_ANDROID_MK
