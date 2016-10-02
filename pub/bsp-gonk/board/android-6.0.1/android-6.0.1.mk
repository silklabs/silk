TARGET_GE_MARSHMALLOW=true
TARGET_AOSPBLUETOOTH_SUPPORTS_GUEST_MODE=true

# Most silk components use the NDK's stlport
PRODUCT_COPY_FILES += \
  prebuilts/ndk/current/sources/cxx-stl/stlport/libs/armeabi-v7a/libstlport_shared.so:system/lib/libstlport_shared.so
