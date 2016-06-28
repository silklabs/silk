
# Exclude internal-only projects since this board is shared with partners
PRODUCT_PACKAGES := $(filter-out $(INTERNALONLY_PACKAGES),$(PRODUCT_PACKAGES))

