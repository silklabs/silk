TARGET_GE_MARSHMALLOW=true

# Most silk components use the NDK's stlport
PRODUCT_COPY_FILES += \
  prebuilts/ndk/current/sources/cxx-stl/stlport/libs/armeabi-v7a/libstlport_shared.so:system/lib/libstlport_shared.so
