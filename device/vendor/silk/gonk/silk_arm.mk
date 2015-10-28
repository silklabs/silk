# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.
#
# Minimal (base) Silk ARM product
#
$(call inherit-product, $(SRC_TARGET_DIR)/product/aosp_arm.mk)
$(call inherit-product, vendor/silk/gonk/silk_generic.mk)

PRODUCT_NAME := silk_arm
