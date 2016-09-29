/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 */

package com.silklabs.appsdk;

import android.app.Activity;
import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.Bundle;
import android.os.IBinder;
import android.support.annotation.Nullable;
import android.util.Log;

import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.LifecycleState;
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.shell.MainReactPackage;
import com.oney.WebRTCModule.WebRTCModule;
import com.oney.WebRTCModule.WebRTCModulePackage;

import org.webrtc.MediaStream;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;

public class SilkAppSDKService extends Service {

  private ServiceBinder mBinder = new ServiceBinder();
  private DefaultHardwareBackBtnHandler mBackBtnHandler =
    new DefaultHardwareBackBtnHandler() {
      @Override
      public void invokeDefaultOnBackPressed() {
        // Empty.
      }
    };
  private ReactInstanceManager mReactInstanceManager;
  private SilkAppSDKDelegate mDelegate;
  private boolean mInitialized = false;

  public SilkAppSDKService() {
  }

  protected String getJSMainModuleName() {
    return "app-sdk/src/sdk/index";
  }

  protected boolean getUseDeveloperSupport() {
    return BuildConfig.DEBUG;
  }

  protected List<ReactPackage> getPackages() {
    return Arrays.<ReactPackage>asList(
      new MainReactPackage(),
      new SilkAppSDKReactPackage(mDelegate),
      new WebRTCModulePackage());
  }

  protected @Nullable
  String getBundleAssetName() {
    return "index.android.bundle";
  };

  protected ReactInstanceManager createReactInstanceManager() {
    ReactInstanceManager.Builder builder = ReactInstanceManager.builder()
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

  public void onActivityPause() {
    mReactInstanceManager.onHostPause();
  }

  public void onActivityResume(Activity activity) {
    mReactInstanceManager.onHostResume(activity, mBackBtnHandler);
  }

  public void onActivityDestroy() {
    mReactInstanceManager.onHostDestroy();
  }

  private static WritableMap toWritableMap(Map<String, Object> map) {
    WritableMap writableMap = new WritableNativeMap();
    for (Map.Entry<String, Object> entry : map.entrySet()) {
      Object item = entry.getValue();
      if (item == null) {
        writableMap.putNull(entry.getKey());
      } else if (item instanceof Boolean) {
        writableMap.putBoolean(entry.getKey(), (Boolean)item);
      } else if (item instanceof Integer) {
        writableMap.putInt(entry.getKey(), (Integer)item);
      } else if (item instanceof Double) {
        writableMap.putDouble(entry.getKey(), (Double) item);
      } else if (item instanceof String) {
        writableMap.putString(entry.getKey(), (String) item);
      } else if (item instanceof ArrayList) {
        writableMap.putArray(entry.getKey(), toWritableArray((ArrayList) item));
      } else if (item instanceof Map) {
        writableMap.putMap(entry.getKey(), toWritableMap((Map)item));
      }
    }
    return writableMap;
  }

  private static WritableArray toWritableArray(ArrayList list) {
    WritableArray array = new WritableNativeArray();
    for (Object item: list) {
      if (item == null) {
        array.pushNull();
      } else if (item instanceof Boolean) {
        array.pushBoolean((Boolean)item);
      } else if (item instanceof Integer) {
        array.pushInt((Integer)item);
      } else if (item instanceof Double) {
        array.pushDouble((Double)item);
      } else if (item instanceof String) {
        array.pushString((String)item);
      } else if (item instanceof ArrayList) {
        array.pushArray(toWritableArray((ArrayList)item));
      } else if (item instanceof Map) {
        array.pushMap(toWritableMap((Map)item));
      }
    }
    return array;
  }

  public void postMessage(Map<String, Object> message) {
    if (!mInitialized) {
      Map<String, Object> errorMsg = new HashMap<>();
      errorMsg.put("type", "MESSAGE_ERROR");
      errorMsg.put("error", "NOT_INITIALIZED");
      errorMsg.put("message", message);
      mDelegate.onMessage(errorMsg);
      return;
    }
    mReactInstanceManager.getCurrentReactContext()
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit("silkAppSDKMessage", toWritableMap(message));
  }

  public MediaStream getMediaStreamForID(String id) {
    WebRTCModule module = mReactInstanceManager.getCurrentReactContext().getNativeModule(WebRTCModule.class);
    return module.mMediaStreams.get(id);
  }
}
