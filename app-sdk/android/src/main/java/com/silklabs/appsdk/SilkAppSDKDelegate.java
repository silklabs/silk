/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

package com.silklabs.appsdk;

import android.os.Bundle;

public interface SilkAppSDKDelegate {

  /**
   * Receive message from SDK.
   */
  void onMessage(Bundle message);

}
