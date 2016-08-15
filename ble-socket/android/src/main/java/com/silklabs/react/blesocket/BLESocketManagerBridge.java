package com.silklabs.react.blesocket;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.UUID;

public class BLESocketManagerBridge
  extends ReactContextBaseJavaModule
  implements LifecycleEventListener {

  private static final String TAG = "BLESocketManagerBridge";

  private static final int PERMISSION_REQUEST_COARSE_LOCATION = 1;

  private final BroadcastReceiver mReceiver = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      BLESocketManagerBridge.this.onReceive(context, intent);
    }
  };

  // May only be used on the main thread.
  private final BLESocketManager mSocketManager;

  // May only be used on the bridge thread.
  private boolean mReceiverRegistered = false;
  private boolean mLocationPermissionChecked = false;

  public BLESocketManagerBridge(final ReactApplicationContext reactContext) {
    super(reactContext);

    Log.d(TAG, "constructor");

    Utils.check(reactContext != null);

    mSocketManager = new BLESocketManager(reactContext, this);
    reactContext.addLifecycleEventListener(this);
  }

  private void onReceive(Context context, Intent intent) {
    final String action = intent.getAction();
    Log.d(TAG, "onReceive('" + action + "')");

    switch (action) {
      case BluetoothAdapter.ACTION_STATE_CHANGED: {
        final int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE,
                                             BluetoothAdapter.ERROR);

        switch (state) {
          case BluetoothAdapter.STATE_OFF:
            Log.d(TAG, "Bluetooth turned off");
            break;
          case BluetoothAdapter.STATE_TURNING_OFF:
            Log.d(TAG, "Bluetooth turning off...");
            break;
          case BluetoothAdapter.STATE_ON:
            Log.d(TAG, "Bluetooth turned on");
            break;
          case BluetoothAdapter.STATE_TURNING_ON:
            Log.d(TAG, "Bluetooth turning on...");
            break;
          default:
            Log.w(TAG, "Unhandled bluetooth state: " + state);
        }

        Utils.postToMainThread(new Runnable() {
          @Override
          public void run() {
            mSocketManager.bluetoothStateChanged();
          }
        });
        break;
      }

      default: {
        Log.w(TAG, "Unhandled broadcast action: '" + action + "'");
      }
    }
  }

  private void sendEvent(final String eventName, final WritableMap params) {
    getReactApplicationContext()
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(eventName, params);
  }

  void sendConnect(final int connectionId) {
    WritableMap params = Arguments.createMap();
    params.putInt("id", connectionId);
    sendEvent("silk-blesocketmanager-connect", params);
  }

  void sendIncomingData(final int connectionId, final byte[] data) {
    WritableMap params = Arguments.createMap();
    params.putInt("id", connectionId);
    params.putString("data", Base64.encodeToString(data, Base64.DEFAULT));
    sendEvent("silk-blesocketmanager-data", params);
  }

  void sendRssiUpdate(final int connectionId, final int rssi) {
    WritableMap params = Arguments.createMap();
    params.putInt("id", connectionId);
    params.putInt("rssi", rssi);
    sendEvent("silk-blesocketmanager-rssi", params);
  }

  void sendEnd(final int connectionId) {
    WritableMap params = Arguments.createMap();
    params.putInt("id", connectionId);
    sendEvent("silk-blesocketmanager-end", params);
  }

  void sendDisconnected(final int connectionId) {
    WritableMap params = Arguments.createMap();
    params.putInt("id", connectionId);
    sendEvent("silk-blesocketmanager-disconnect", params);
  }

  void sendUnconfiguredDevicesInRange(final boolean inRange) {
    WritableMap params = Arguments.createMap();
    params.putBoolean("inRange", inRange);
    sendEvent("silk-blesocketmanager-unconfigured-devices", params);
  }

  void sendDevicesBeaconing(final UUID serviceUuid,
                            final int deviceNumber,
                            final boolean beaconing) {
    WritableMap params = Arguments.createMap();
    params.putString("serviceUuid", serviceUuid.toString());
    params.putInt("deviceNumber", deviceNumber);
    params.putBoolean("beaconing", beaconing);
    sendEvent("silk-blesocketmanager-device-beaconing", params);
  }

  @Override
  public String getName() {
    return "BLESocketManager";
  }

  @Override
  public void onHostResume() {
    Log.d(TAG, "onHostResume");

    if (!mReceiverRegistered) {
      final IntentFilter filter =
        new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
      getReactApplicationContext().registerReceiver(mReceiver, filter);
      mReceiverRegistered = true;
    }

    if (!mLocationPermissionChecked) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        final Activity activity = getCurrentActivity();
        final String permissionType =
          Manifest.permission.ACCESS_COARSE_LOCATION;
        final int permission = activity.checkSelfPermission(permissionType);

        if (permission == PackageManager.PERMISSION_GRANTED) {
          Log.d(TAG, "Location permission granted");
        } else {
          Log.w(TAG, "Location permission not granted, requesting now");
          activity.requestPermissions(new String[]{permissionType},
                                      PERMISSION_REQUEST_COARSE_LOCATION);
        }
      }
      mLocationPermissionChecked = true;
    }

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.onHostResume();
      }
    });
  }

  @Override
  public void onHostPause() {
    Log.d(TAG, "onHostPause");

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.onHostPause();
      }
    });
  }

  @Override
  public void onHostDestroy() {
    Log.d(TAG, "onHostDestroy");

    getReactApplicationContext().unregisterReceiver(mReceiver);
    mReceiverRegistered = false;

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.onHostDestroy();
      }
    });
  }

  @ReactMethod
  public void start() {
    Log.d(TAG, "start");

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.setEnabled();
      }
    });
  }

  @ReactMethod
  public void stop() {
    Log.d(TAG, "start");

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.setDisabled();
      }
    });
  }

  @ReactMethod
  public void addBeaconUuid(String beaconUuidString) {
    Log.d(TAG, "addBeaconUuid: " + beaconUuidString);

    final UUID uuid;
    try {
      uuid = UUID.fromString(beaconUuidString);
    } catch(Exception e) {
      Log.e(TAG, "Invalid uuid: " + beaconUuidString + ": " + e);
      return;
    }

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.regionAdded(uuid);
      }
    });
  }

  @ReactMethod
  public void removeBeaconUuid(String beaconUuidString) {
    Log.d(TAG, "removeBeaconUuid: " + beaconUuidString);

    final UUID uuid;
    try {
      uuid = UUID.fromString(beaconUuidString);
    } catch(Exception e) {
      Log.e(TAG, "Invalid uuid: " + beaconUuidString + ": " + e);
      return;
    }

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.regionRemoved(uuid);
      }
    });
  }

  @ReactMethod
  public void removeAllBeaconUuids() {
    Log.d(TAG, "removeAllBeaconUuids");

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.removeAllBeaconUuids();
      }
    });
  }

  @ReactMethod
  public void send(final int connectionId, String dataBase64) {
    Log.d(TAG, "send " + connectionId);

    final byte[] data = Base64.decode(dataBase64, Base64.DEFAULT);
    if (data == null) {
      Log.w(TAG, "Failed to decode base64 data");
      return;
    }

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.sendOutgoing(connectionId, data);
      }
    });
  }

  @ReactMethod
  public void enableRssiUpdates(final int connectionId, final boolean enable) {
    Log.d(TAG, "enableRssiUpdates " + connectionId + ", " + enable);

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.enableRssiUpdates(connectionId, enable);
      }
    });
  }

  @ReactMethod
  public void finish(final int connectionId) {
    Log.d(TAG, "finish " + connectionId);

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.finish(connectionId);
      }
    });
  }

  @ReactMethod
  public void disconnect(final int connectionId) {
    Log.d(TAG, "finish " + connectionId);

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.disconnect(connectionId);
      }
    });
  }

  @ReactMethod
  public void scanForUnconfiguredDevices(final boolean shouldScan) {
    Log.d(TAG, "scanForUnconfiguredDevices: " + shouldScan);

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        mSocketManager.scanForUnconfiguredDevices(shouldScan);
      }
    });
  }

  @ReactMethod
  public void scanForDevice(String serviceUuid,
                            int accountDeviceNumber,
                            boolean shouldScan) {
    // TODO
  }

}
