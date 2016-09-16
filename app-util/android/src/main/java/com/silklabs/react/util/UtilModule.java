package com.silklabs.react.util;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import android.content.Context;
import android.net.wifi.SupplicantState;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;

import java.util.Map;
import java.util.HashMap;

public class UtilModule extends ReactContextBaseJavaModule {
  private ReactContext mReactContext;

  public UtilModule(ReactApplicationContext reactContext) {
    super(reactContext);
    mReactContext = reactContext;
  }

  @Override
  public String getName() {
    return "SLKUtil";
  }

  @ReactMethod
  public void genWifiInfo(Promise promise) {
    WifiManager wifiManager = (WifiManager)mReactContext.getSystemService(Context.WIFI_SERVICE);
    WifiInfo wifiInfo = wifiManager.getConnectionInfo();
    if (wifiInfo.getSupplicantState() == SupplicantState.COMPLETED) {
      WritableMap info = Arguments.createMap();
      info.putString("SSID", wifiInfo.getSSID());
      info.putString("BSSID", wifiInfo.getBSSID());
      promise.resolve(info);
      return;
    }
    promise.resolve(null);
  }

  @Override
  public Map<String, Object> getConstants() {
    final Map<String, Object> constants = new HashMap<>();
    constants.put("manufacturer", Build.MANUFACTURER);
    constants.put("model", Build.MODEL);
    constants.put("name", null);
    constants.put("systemName", "Android");
    constants.put("systemVersion", Build.VERSION.RELEASE);
    return constants;
  }

}
