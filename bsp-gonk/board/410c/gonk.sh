export TARGET_PRODUCT=msm8916_64
export TARGET_BUILD_VARIANT=userdebug
export TARGET_BUILD_TYPE=release

BSP_PACKAGE_NAME=android_board_support_package_vla.br_.1.2.4-01810-8x16.0-2.zip
BSP_PACKAGE_URL=https://developer.qualcomm.com/download/db410c/linux_android_board_support_package_vla.br_.1.2.4-01810-8x16.0-2.zip

if [[ ! -d vendor/qcom/proprietary ]]; then
  while [[ ! -f $BSP_PACKAGE_NAME ]]; do
    echo
    echo '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
    echo
    echo Please download the Android Board Support Package from:
    echo $BSP_PACKAGE_URL
    echo
    echo and place it at $PWD/$BSP_PACKAGE_NAME
    echo
    echo '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
    echo
    read -r -p 'Press ENTER to retry, ^C to abort'
  done

  echo
  echo Extracting Android Board Support Package:
  BLOB_TARBALL=android_board_support_package_vla.br_.1.2.4-01810-8x16.0-2/linux_android_board_support_package_vla.br_.1.2.4-01810-8x16.0-2/proprietary_LA.BR.1.2.4-01810-8x16.0_410C_Aug.tgz
  (
    set -x
    rm -f $BLOB_TARBALL
    unzip $BSP_PACKAGE_NAME $BLOB_TARBALL
    ( cd vendor/qcom/; tar zxf ../../$BLOB_TARBALL )
  )
  du -hs vendor/qcom/proprietary/
  echo
fi

