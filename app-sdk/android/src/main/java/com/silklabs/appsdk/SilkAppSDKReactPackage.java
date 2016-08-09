/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

package com.silklabs.appsdk;

import com.silklabs.react.blesocket.BLESocketManager;
import com.silklabs.react.blobs.BlobModule;
import com.silklabs.react.blobs.WebSocketModule;
import com.silklabs.react.crypto.CryptoModule;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.JavaScriptModule;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class SilkAppSDKReactPackage implements ReactPackage {

  SilkAppSDKDelegate mDelegate;

  SilkAppSDKReactPackage(SilkAppSDKDelegate delegate) {
    super();
    mDelegate = delegate;
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new SilkAppSDKEventEmitter(reactContext, mDelegate));
    modules.add(new CryptoModule(reactContext));
    modules.add(new BLESocketManager(reactContext));
    modules.add(new BlobModule(reactContext));
    modules.add(new WebSocketModule(reactContext));
    return modules;
  }

  @Override
  public List<Class<? extends JavaScriptModule>> createJSModules() {
    return Collections.emptyList();
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }
}
