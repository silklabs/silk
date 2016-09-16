# There's no nice target to build RECOVERY_INSTALL_OTA_KEYS
# so this build task adds one.
ifeq (,$(filter true, $(TARGET_NO_KERNEL) $(TARGET_NO_RECOVERY)))
.PHONY: otakeys
otakeys: $(RECOVERY_INSTALL_OTA_KEYS)
endif
