package com.silklabs.app.modules;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;

import android.os.Build;

import java.util.Map;
import java.util.HashMap;

public class SLKUtil extends ReactContextBaseJavaModule {

  public SLKUtil(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "SLKUtil";
  }

  @Override
  public Map<String, Object> getConstants() {
    final Map<String, Object> constants = new HashMap<>();
    // TODO verify
    constants.put("model", Build.MODEL);
    constants.put("name", Build.DEVICE);
    constants.put("systemName", "Android");
    constants.put("systemVersion", Build.VERSION.RELEASE);
    return constants;
  }

}
