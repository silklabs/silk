# Sets up make product needed to build this board
TARGET_QBLUETOOTH_HCI_CMD_SEND=true

PRODUCT_PROPERTY_OVERRIDES += \
 ro.silk.camera.focus_mode=auto

PRODUCT_COPY_FILES += \
  board/kenzo/splash/splash.img:splash.img \

