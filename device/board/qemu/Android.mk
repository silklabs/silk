LOCAL_PATH := $(call my-dir)
ifeq ($(SILK_BOARD),qemu)
$(call add-radio-file,run.sh)
endif
