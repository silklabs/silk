# Copyright (c) 2017 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# This task builds silk.img, which is an ext4 filesystem containing the contents
# of /system/silk.  It may be pushed onto a device at /data/silk.img (if not
# overridden by ro.silk.update.img.file), and activated via |adb shell setprop
# persist.silk.root silk.img|.  When active it overrides the current contents of
# /system/silk.

SILKIMAGE=$(PRODUCT_OUT)/silk.img
.PHONY: $(SILKIMAGE)

.PHONY: silkimage
silkimage: $(SILKIMAGE)

$(SILKIMAGE): $(MAKE_EXT4FS)
	@echo "silk.img: $@"
	$(MAKE_EXT4FS) \
    -l $$(( ($$(du -sh $(TARGET_OUT_SILK) | cut -dM -f1) + 50) * 1000000 )) \
    -i 2048 \
    -L silkimage \
    -J \
    $@ \
    $(TARGET_OUT_SILK)

