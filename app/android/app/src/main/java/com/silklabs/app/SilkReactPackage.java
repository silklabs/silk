package com.silklabs.app;

import com.silklabs.app.modules.AppCrypto;
import com.silklabs.app.modules.BLESocketManager;
import com.silklabs.app.modules.SLKUtil;
import com.silklabs.app.modules.WebSocketModule;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.JavaScriptModule;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.silklabs.app.views.MSEPlayerManager;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

class SilkReactPackage implements ReactPackage {

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new AppCrypto(reactContext));
    modules.add(new BLESocketManager(reactContext));
    modules.add(new SLKUtil(reactContext));
    modules.add(new WebSocketModule(reactContext));
    return modules;
  }

  @Override
  public List<Class<? extends JavaScriptModule>> createJSModules() {
    return Collections.emptyList();
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Arrays.<ViewManager>asList(
      new MSEPlayerManager());
  }

}
