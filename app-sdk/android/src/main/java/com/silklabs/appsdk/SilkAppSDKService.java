/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

package com.silklabs.appsdk;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.Bundle;
import android.os.IBinder;
import android.support.annotation.Nullable;
import android.util.Log;

import com.facebook.react.LifecycleState;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.shell.MainReactPackage;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.List;
import java.util.Queue;

public class SilkAppSDKService extends Service {

  private ServiceBinder mBinder = new ServiceBinder();
  private ReactInstanceManager mReactInstanceManager;
  private SilkAppSDKDelegate mDelegate;
  private boolean mInitialized = false;

  public SilkAppSDKService() {
  }

  protected String getJSMainModuleName() {
    return "app-sdk/src/index";
  }

  protected boolean getUseDeveloperSupport() {
    return BuildConfig.DEBUG;
  }

  protected List<ReactPackage> getPackages() {
    return Arrays.<ReactPackage>asList(
      new MainReactPackage(),
      new SilkAppSDKReactPackage(mDelegate));
  }

  protected @Nullable
  String getBundleAssetName() {
    return "index.android.bundle";
  };

  protected ReactInstanceManager createReactInstanceManager() {
    ReactInstanceManager.Builder builder = ReactInstanceManager.builder()
      .setUseOldBridge(true)
      .setApplication(getApplication())
      .setJSMainModuleName(getJSMainModuleName())
      .setBundleAssetName(getBundleAssetName())
      .setUseDeveloperSupport(getUseDeveloperSupport())
      .setInitialLifecycleState(LifecycleState.BEFORE_RESUME);

    for (ReactPackage reactPackage : getPackages()) {
      builder.addPackage(reactPackage);
    }

    return builder.build();
  }

  public class ServiceBinder extends Binder {
    public SilkAppSDKService getService() {
      return SilkAppSDKService.this;
    }
  }

  @Override
  public IBinder onBind(Intent intent) {
    return mBinder;
  }

  /**
   * Public APIs:
   */

  public void start(SilkAppSDKDelegate delegate) {
    mDelegate = delegate;
    mReactInstanceManager = createReactInstanceManager();
    mReactInstanceManager.addReactInstanceEventListener(new ReactInstanceManager.ReactInstanceEventListener() {
      @Override
      public void onReactContextInitialized(ReactContext context) {
        mInitialized = true;
      }
    });
    mReactInstanceManager.createReactContextInBackground();
  }

  public void postMessage(Bundle message) {
    if (!mInitialized) {
      Bundle bundle = new Bundle();
      bundle.putString("type", "MESSAGE_ERROR");
      bundle.putString("error", "NOT_INITIALIZED");
      bundle.putBundle("message", message);
      mDelegate.onMessage(bundle);
      return;
    }
    mReactInstanceManager.getCurrentReactContext()
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit("silkAppSDKMessage", Arguments.fromBundle(message));
  }
}
