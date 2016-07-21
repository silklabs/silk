/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

package com.silklabs.appsdk;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableNativeMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class SilkAppSDKEventEmitter extends ReactContextBaseJavaModule {

  private SilkAppSDKDelegate mDelegate;

  public SilkAppSDKEventEmitter(ReactApplicationContext reactContext, SilkAppSDKDelegate delegate) {
    super(reactContext);
    mDelegate = delegate;
  }

  @Override
  public String getName() {
    return "SLKAppSDKEventEmitter";
  }

  private void sendEvent(String eventName, WritableMap params) {
    getReactApplicationContext()
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(eventName, params);
    }

  @ReactMethod
  public void postMessage(ReadableMap message) {
    ReadableNativeMap map = (ReadableNativeMap)message;
    mDelegate.onMessage(map.toHashMap());
  }
}
