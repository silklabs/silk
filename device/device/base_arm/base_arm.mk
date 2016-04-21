# Minimal (base) ARM product

$(call inherit-product, $(SRC_TARGET_DIR)/product/aosp_arm.mk)
$(call inherit-product, product/$(SILK_PRODUCT)/$(SILK_PRODUCT).mk)

PRODUCT_NAME := base_arm
