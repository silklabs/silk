# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

SILKOTA_PACKAGE := \
  $(call intermediates-dir-for,PACKAGING,silkota_files)/$(TARGET_PRODUCT)-silkota_files-$(FILE_NAME_TAG).zip

SILKOTA_UPDATER_SCRIPT=vendor/silk/build/tasks/updater-script
SILKOTA_CONTENTS:=$(shell test -d $(TARGET_OUT_SILK) && find $(TARGET_OUT_SILK) -type f)

# Prefer to use an update-binary built from the tree, but if not possible then
# fallback to the prebuilt updater
ifeq ($(wildcard bootable/recovery/updater/Android.mk),)
SILKOTA_UPDATE_BINARY=prebuilts/device/$(GONK)/$(TARGET_PRODUCT)/updater
else
SILKOTA_UPDATE_BINARY=$(call intermediates-dir-for,EXECUTABLES,updater)/updater
endif

$(SILKOTA_PACKAGE): $(SILKOTA_UPDATER_SCRIPT) $(SILKOTA_UPDATE_BINARY) $(SILKOTA_CONTENTS)
	@echo "Silk OTA files: $@"
	$(hide) rm -rf $(@D)
	$(hide) mkdir -p $(@D)/zip/META-INF/com/google/android
	$(hide) $(ACP) $(SILKOTA_UPDATER_SCRIPT) $(@D)/zip/META-INF/com/google/android/updater-script
	$(hide) $(ACP) $(SILKOTA_UPDATE_BINARY) $(@D)/zip/META-INF/com/google/android/update-binary
	$(hide) rsync -a $(TARGET_OUT_SILK) $(@D)/zip
	$(hide) (cd $(@D)/zip && zip -qry ../$(notdir $@) .)

.PHONY: silkota-package
silkota-package: $(SILKOTA_PACKAGE)


SILKOTA_ZIP := $(PRODUCT_OUT)/$(TARGET_PRODUCT)-silkota-$(FILE_NAME_TAG).zip

$(SILKOTA_ZIP): KEY_CERT_PAIR := $(DEFAULT_KEY_CERT_PAIR)
$(SILKOTA_ZIP): SIGNAPK=external/librecovery/tools/signapk.jar
$(SILKOTA_ZIP): $(SIGNAPK) $(SILKOTA_PACKAGE)
$(SILKOTA_ZIP): $(SILKOTA_PACKAGE)
	@echo "Silk OTA zip: $@"
	$(hide) java -Xmx2048m -jar $(SIGNAPK) -w $(KEY_CERT_PAIR).x509.pem $(KEY_CERT_PAIR).pk8 $< $@

.PHONY: silkota
silkota: $(SILKOTA_ZIP)
