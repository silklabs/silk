package com.silklabs.react.blesocket;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class BLESocketManager extends ReactContextBaseJavaModule {

  public BLESocketManager(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "BLESocketManager";
  }

  @ReactMethod
  public void start() {
    // TODO
  }

  @ReactMethod
  public void stop() {
    // TODO
  }

  @ReactMethod
  public void addBeaconUuid(String beaconUuid) {
    // TODO
  }

  @ReactMethod
  public void removeBeaconUuid(String beaconUuid) {
    // TODO
  }

  @ReactMethod
  public void removeAllBeaconUuids() {
    // TODO
  }

  @ReactMethod
  public void send(int id, String dataBase64) {
    // TODO
  }

  @ReactMethod
  public void updateRssi(int id) {
    // TODO
  }

}
