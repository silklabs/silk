package com.silklabs.react.blesocket;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.os.ParcelUuid;
import android.util.Log;
import com.facebook.react.bridge.ReactApplicationContext;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public class BLESocketManager {

  private static final String TAG = "BLESocketManager";
  private static final String BLUETOOTH_THREAD_NAME = "com.silklabs.bluetooth";

  private static final int MAX_CHARACTERISTIC_BYTES = 400;
  private static final int DESIRED_CHARACTERISTIC_BYTES = 132;
  private static final int MAX_WRITE_BYTES =
    Math.min(MAX_CHARACTERISTIC_BYTES, DESIRED_CHARACTERISTIC_BYTES);

  private static final int ADVERTISING_MANUFACTURER_CODE = 0x517c;

  private static final UUID CHARACTERISTIC_UUID =
    UUID.fromString("fd30740d-8bdc-4a4d-ad58-66b4343ea3c1");
  private static final int CHARACTERISTIC_PROPERTIES =
    BluetoothGattCharacteristic.PROPERTY_WRITE |
    BluetoothGattCharacteristic.PROPERTY_NOTIFY;
  private static final int CHARACTERISTIC_PERMISSIONS =
    BluetoothGattCharacteristic.PERMISSION_WRITE;

  // This is the standardized Client Characteristic Configuration UUID for all
  // GATT characteristic subscriptions.
  private static final UUID CCCD_UUID =
    UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
  private static final int CCCD_PERMISSIONS =
    BluetoothGattDescriptor.PERMISSION_READ |
    BluetoothGattDescriptor.PERMISSION_WRITE;

  private static int sNextConnectionId = 0;

  private static BLESocketManager sLastInstance;

  private class Service extends BluetoothGattService {

    Service(UUID uuid) {
      super(uuid, BluetoothGattService.SERVICE_TYPE_PRIMARY);

      final BluetoothGattCharacteristic characteristic =
        new BluetoothGattCharacteristic(CHARACTERISTIC_UUID,
                                        CHARACTERISTIC_PROPERTIES,
                                        CHARACTERISTIC_PERMISSIONS);

      final BluetoothGattDescriptor cccd =
        new BluetoothGattDescriptor(CCCD_UUID, CCCD_PERMISSIONS);

      characteristic.addDescriptor(cccd);

      addCharacteristic(characteristic);
    }
  }

  private class ServiceInfo {
    final BluetoothGattService mService;

    boolean mEnabled = false;
    boolean mAdding = false;
    boolean mAdded = false;
    boolean mRemoveAfterAdding = false;
    boolean mInBeaconRange = false;
    Set<Integer> mDeviceNumbersBeaconing = new HashSet<>();
    Set<Integer> mDeviceNumbersRequested = new HashSet<>();

    boolean shouldScan() {
      Utils.check(mInBeaconRange || mDeviceNumbersBeaconing.isEmpty());
      return mEnabled && (mInBeaconRange || !mDeviceNumbersRequested.isEmpty());
    }

    ServiceInfo(BluetoothGattService service, boolean enabled) {
      mService = service;
      mEnabled = enabled;
    }
  }

  private class Connection {
    final BluetoothGatt mGatt;
    final BluetoothGattCharacteristic mCharacteristic;
    final UUID mServiceUuid;
    final String mAddress;
    final int mId = sNextConnectionId++;

    // Whether or not the remote device is subscribed/unsubscribed from this
    // device's characteristic.
    boolean mSubscribed = false;
    boolean mUnsubscribed = false;

    boolean mFinished = false;
    boolean mDisconnected = false;

    byte[] mPreparedWriteValue = null;

    List<byte[]> mOutgoingQueue = new ArrayList<>();
    byte[] mCurrentOutgoingData = null;

    boolean mRssiUpdatesEnabled = false;

    Connection(BluetoothGatt gatt,
               BluetoothGattCharacteristic characteristic) {
      mGatt = gatt;
      mCharacteristic = characteristic;
      mServiceUuid = characteristic.getService().getUuid();
      mAddress = gatt.getDevice().getAddress();
    }
  }

  private class ManufacturerData {
    final int mVersion;

    ManufacturerData(int version) {
      mVersion = version;
    }

    int version() {
      return mVersion;
    }

    Integer getDeviceType() {
      return null;
    }

    Integer getDeviceNumber() {
      return null;
    }
  }

  private class ManufacturerDataV1 extends ManufacturerData {
    final int mDeviceType;
    final int mDeviceNumber;

    ManufacturerDataV1(int version, int deviceType, int deviceNumber) {
      super(version);
      mDeviceType = deviceType;
      mDeviceNumber = deviceNumber;
    }

    @Override
    Integer getDeviceType() {
      return mDeviceType;
    }

    @Override
    Integer getDeviceNumber() {
      return mDeviceNumber;
    }
  }

  private class ScanCallback extends android.bluetooth.le.ScanCallback {
    @Override
    public void onScanResult(int callbackType, final ScanResult result) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onScanResult(result);
        }
      });
    }

    @Override
    public void onBatchScanResults(final List<ScanResult> results) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          final BLESocketManager self = BLESocketManager.this;
          for (ScanResult scanResult : results) {
            self.onScanResult(scanResult);
          }
        }
      });
    }

    @Override
    public void onScanFailed(final int errorCode) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onScanFailed(errorCode);
        }
      });
    }
  }

  private class ServerCallback extends BluetoothGattServerCallback {
    @Override
    public void onConnectionStateChange(final BluetoothDevice device,
                                        final int status,
                                        final int newState) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onConnectionStateChange(device,
                                                        status,
                                                        newState);
        }
      });
    }

    @Override
    public void onServiceAdded(final int status,
                               final BluetoothGattService service) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onServiceAdded(status, service);
        }
      });
    }

    @Override
    public void onCharacteristicReadRequest(final BluetoothDevice device,
                                            final int requestId,
                                            final int offset,
                                            final BluetoothGattCharacteristic characteristic) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onCharacteristicReadRequest(device,
                                                            requestId,
                                                            offset,
                                                            characteristic);
        }
      });
    }

    @Override
    public void onCharacteristicWriteRequest(final BluetoothDevice device,
                                             final int requestId,
                                             final BluetoothGattCharacteristic characteristic,
                                             final boolean preparedWrite,
                                             final boolean responseNeeded,
                                             final int offset,
                                             final byte[] value) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onCharacteristicWriteRequest(device,
                                                             requestId,
                                                             characteristic,
                                                             preparedWrite,
                                                             responseNeeded,
                                                             offset,
                                                             value);
        }
      });
    }

    @Override
    public void onDescriptorReadRequest(final BluetoothDevice device,
                                        final int requestId,
                                        final int offset,
                                        final BluetoothGattDescriptor descriptor) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onDescriptorReadRequest(device,
                                                        requestId,
                                                        offset,
                                                        descriptor);
        }
      });
    }

    @Override
    public void onDescriptorWriteRequest(final BluetoothDevice device,
                                         final int requestId,
                                         final BluetoothGattDescriptor descriptor,
                                         final boolean preparedWrite,
                                         final boolean responseNeeded,
                                         final int offset,
                                         final byte[] value) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onDescriptorWriteRequest(device,
                                                         requestId,
                                                         descriptor,
                                                         preparedWrite,
                                                         responseNeeded,
                                                         offset,
                                                         value);

        }
      });
    }

    @Override
    public void onExecuteWrite(final BluetoothDevice device,
                               final int requestId,
                               final boolean execute) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onExecuteWrite(device, requestId, execute);
        }
      });
    }
  }

  private class ClientCallback extends BluetoothGattCallback {
    @Override
    public void onConnectionStateChange(final BluetoothGatt gatt,
                                        final int status,
                                        final int newState) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onConnectionStateChange(gatt, status, newState);
        }
      });
    }

    @Override
    public void onServicesDiscovered(final BluetoothGatt gatt,
                                     final int status) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onServicesDiscovered(gatt, status);
        }
      });
    }

    @Override
    public void onCharacteristicWrite(final BluetoothGatt gatt,
                                      final BluetoothGattCharacteristic characteristic,
                                      final int status) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onCharacteristicWrite(gatt,
                                                      characteristic,
                                                      status);
        }
      });
    }

    @Override
    public void onDescriptorWrite(final BluetoothGatt gatt,
                                  final BluetoothGattDescriptor descriptor,
                                  final int status) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onDescriptorWrite(gatt, descriptor, status);
        }
      });
    }

    @Override
    public void onReadRemoteRssi(final BluetoothGatt gatt,
                                 final int rssi,
                                 final int status) {
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          BLESocketManager.this.onReadRemoteRssi(gatt, rssi, status);
        }
      });
    }
  }

  private final ReactApplicationContext mReactContext;
  private final BLESocketManagerBridge mBridge;
  private final RegionMonitor mRegionMonitor;
  private final ServerCallback mServerCallback = new ServerCallback();
  private final ScanCallback mScanCallback = new ScanCallback();
  private final ClientCallback mClientCallback = new ClientCallback();

  // May only be touched on the main thread.
  private BluetoothManager mBluetoothManager;
  private BluetoothAdapter mBluetoothAdapter;
  private BluetoothLeScanner mBluetoothScanner;
  private BluetoothGattServer mGattServer;
  private Map<UUID, ServiceInfo> mServices = new HashMap<>();
  private boolean mInForeground = true;
  private boolean mScanning = false;
  private Set<String> mScanBlacklist = new HashSet<>();
  private Set<String> mScanWhitelist = new HashSet<>();
  private Map<String, BluetoothGatt> mPendingDevices = new HashMap<>();
  private boolean mEnabled = false;
  private boolean mUnconfiguredDevicesInRange = false;
  private boolean mShouldScanForUnconfiguredDevices = false;
  private Map<Integer, Connection> mConnectionsById = new HashMap<>();
  private Map<String, Connection> mConnectionsByAddress = new HashMap<>();

  BLESocketManager(final ReactApplicationContext reactContext,
                   final BLESocketManagerBridge bridge) {
    Log.d(TAG, "constructor");

    if (sLastInstance != null) {
      final BLESocketManager instance = sLastInstance;
      Utils.postToMainThread(new Runnable() {
        @Override
        public void run() {
          instance.cleanupMainThread();
        }
      });
    }
    sLastInstance = this;

    Utils.check(reactContext != null);
    mReactContext = reactContext;

    Utils.check(bridge != null);
    mBridge = bridge;

    final Service configService = new Service(RegionMonitor.CONFIG_BEACON_UUID);

    mServices.put(configService.getUuid(),
                  new ServiceInfo(configService, false));

    postInitMainThread();

    // Always call this last.
    mRegionMonitor = new RegionMonitor(reactContext, this);
  }

  private void postInitMainThread() {
    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        initMainThread();
      }
    });
  }

  private void initMainThread() {
    Log.d(TAG, "initMainThread");
    Utils.checkMainThread();

    mBluetoothManager =
      (BluetoothManager) mReactContext.getSystemService(Context.BLUETOOTH_SERVICE);
    Utils.check(mBluetoothManager != null);

    mBluetoothAdapter = mBluetoothManager.getAdapter();
    Utils.check(mBluetoothAdapter != null);

    mBluetoothScanner = mBluetoothAdapter.getBluetoothLeScanner();
    Utils.check(mBluetoothScanner != null);

    if (!mBluetoothAdapter.isEnabled()) {
      Log.w(TAG, "Bluetooth is disabled");

      final Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      mReactContext.startActivity(intent);
      return;
    }

    Log.d(TAG, "Bluetooth is enabled");
  }

  private void cleanupMainThread() {
    Log.d(TAG, "cleanupMainThread");
    Utils.checkMainThread();

    stopScanning();

    List<Connection> connections = new ArrayList<>(mConnectionsById.values());
    for (Connection connection : connections) {
      cleanupConnection(connection);
    }

    for (BluetoothGatt gatt : mPendingDevices.values()) {
      gatt.disconnect();
      gatt.close();
    }

    if (mGattServer != null) {
      mGattServer.close();
      mGattServer = null;
    }

    mRegionMonitor.cleanupMainThread();

    mBluetoothManager = null;
    mBluetoothAdapter = null;
    mBluetoothScanner = null;
    mServices.clear();
    mInForeground = false;
    mScanning = false;
    mScanBlacklist.clear();
    mScanWhitelist.clear();
    mPendingDevices.clear();
    mEnabled = false;
    mUnconfiguredDevicesInRange = false;
    mShouldScanForUnconfiguredDevices = false;
    mConnectionsById.clear();
    mConnectionsByAddress.clear();
  }

  private void updateScanningState() {
    final boolean btEnabled = mBluetoothAdapter.isEnabled();
    Log.d(TAG,
          "updateScanningState " +
          "btEnabled: " + btEnabled + ", " +
          "enabled: " + mEnabled + ", " +
          "inForeground: " + mInForeground + ", " +
          "scanning: " + mScanning);
    Utils.checkMainThread();

    if (!btEnabled || !mEnabled) {
      stopScanning();
      cancelPendingConnections();

      if (!mConnectionsById.isEmpty()) {
        final List<Connection> connections =
          new ArrayList<>(mConnectionsById.values());
        for (Connection connection : connections) {
          cleanupConnection(connection);
        }
        Utils.check(mConnectionsById.isEmpty());
      }

      return;
    }

    stopScanning();

    final List<ScanFilter> scanFilters = new ArrayList<>();
    final List<UUID> scanUuids = new ArrayList<>();

    for (ServiceInfo serviceInfo : mServices.values()) {
      if (serviceInfo.shouldScan()) {
        final UUID uuid = serviceInfo.mService.getUuid();
        final ScanFilter.Builder builder = new ScanFilter.Builder();
        builder.setServiceUuid(new ParcelUuid(uuid));
        scanFilters.add(builder.build());
        scanUuids.add(uuid);
      }
    }

    if (scanFilters.isEmpty()) {
      return;
    }

    mScanBlacklist.clear();
    mScanWhitelist.clear();

    final ScanSettings.Builder settingsBuilder = new ScanSettings.Builder();
    settingsBuilder.setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY);

    Log.i(TAG, "Scanning for services " + scanUuids);
    mBluetoothScanner.startScan(scanFilters,
                                settingsBuilder.build(),
                                mScanCallback);
    mScanning = true;
  }

  private void stopScanning() {
    Log.d(TAG, "stopScanning");

    if (!mScanning) {
      return;
    }

    Log.i(TAG, "Stopping scan");

    mBluetoothScanner.stopScan(mScanCallback);
    mScanning = false;
    mScanBlacklist.clear();
    mScanWhitelist.clear();
  }

  private void cancelPendingConnections() {
    Log.d(TAG, "cancelPendingConnections");

    if (mPendingDevices.isEmpty()) {
      return;
    }

    for (BluetoothGatt device : mPendingDevices.values()) {
      device.disconnect();
      device.close();
    }
    mPendingDevices.clear();
  }

  private void maybeAddServices() {
    Utils.checkMainThread();

    final boolean btEnabled = mBluetoothAdapter.isEnabled();
    Log.d(TAG,
          "maybeAddServices " +
          "btEnabled: " + btEnabled + ", " +
          "enabled: " + mEnabled + ", " +
          "servicesAdded: " + (mGattServer == null ? "false" : "true"));

    if (mGattServer != null || !btEnabled || !mEnabled) {
      return;
    }

    mGattServer =
      mBluetoothManager.openGattServer(mReactContext, mServerCallback);

    for (ServiceInfo serviceInfo : mServices.values()) {
      if (!serviceInfo.mAdded && !serviceInfo.mAdding) {
        Log.d(TAG, "Adding service " + serviceInfo.mService.getUuid());
        serviceInfo.mAdding = true;
        mGattServer.addService(serviceInfo.mService);
        break;
      }
    }
  }

  private void removeServices() {
    Log.d(TAG, "removeServices");
    Utils.checkMainThread();

    if (mGattServer == null) {
      return;
    }

    for (UUID uuid : new HashSet<>(mServices.keySet())) {
      removeAndCleanupService(uuid);
    }

    mGattServer.close();
    mGattServer = null;
  }

  private void removeAndCleanupService(UUID uuid) {
    Log.d(TAG, "removeAndCleanupService " + uuid);
    Utils.checkMainThread();

    if (mGattServer == null) {
      Log.d(TAG, "Server already cleaned up");
      return;
    }

    final ServiceInfo serviceInfo = mServices.get(uuid);
    if (serviceInfo == null) {
      Log.d(TAG, "No service with uuid " + uuid);
      return;
    }

    if (serviceInfo.mAdding) {
      Log.d(TAG, "Service " + uuid + " currently adding, will remove later");
      serviceInfo.mRemoveAfterAdding = true;
    } else if (serviceInfo.mAdded) {
      Log.d(TAG, "Removing service " + uuid);
      if (mGattServer.removeService(serviceInfo.mService)) {
        serviceInfo.mAdded = false;
      } else {
        Log.w(TAG, "Failed to remove service " + uuid);
      }
    }

    List<Connection> connectionsToCleanUp = new ArrayList<>();
    for (Connection connection : mConnectionsById.values()) {
      if (connection.mServiceUuid.equals(uuid)) {
        connectionsToCleanUp.add(connection);
      }
    }

    for (Connection connection : connectionsToCleanUp) {
      cleanupConnection(connection);
    }
  }

  private void cleanupConnection(Connection connection) {
    Log.d(TAG, "cleanupConnection " + connection.mId);
    Utils.checkMainThread();

    mConnectionsById.remove(connection.mId);
    mConnectionsByAddress.remove(connection.mAddress);
    connection.mPreparedWriteValue = null;

    mBridge.sendDisconnected(connection.mId);

    final BluetoothGatt gatt = connection.mGatt;
    final BluetoothGattCharacteristic characteristic =
      connection.mCharacteristic;
    final BluetoothGattDescriptor descriptor =
      characteristic.getDescriptor(CCCD_UUID);

    if (!gatt.setCharacteristicNotification(characteristic, false)) {
      Log.w(TAG, "Failed to disable notifications");
    }

    if (connection.mDisconnected) {
      gatt.close();
    } else {
      if (descriptor != null &&
          descriptor.getValue() ==
            BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) {
        descriptor.setValue(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);
        if (!gatt.writeDescriptor(descriptor)) {
          Log.w(TAG, "Failed to start writing descriptor");
          gatt.disconnect();
          gatt.close();
        }
        // Will disconnect/close in |onDescriptorWrite|.
      } else {
        gatt.disconnect();
        gatt.close();
      }
    }

    updateScanningState();
  }

  private ManufacturerData parseManufacturerData(final byte[] data) {
    Log.d(TAG, "parseManufacturerData");
    Utils.checkMainThread();

    if (data.length == 0) {
      Log.d(TAG, "Empty data");
      return null;
    }

    final int version = data[0];

    switch (version) {
      case 1:
        return parseManufacturerDataV1(data);

      default:
        Log.d(TAG, "Unknown version " + version);
        return null;
    }
  }

  private ManufacturerDataV1 parseManufacturerDataV1(final byte[] data) {
    Log.d(TAG, "parseManufacturerDataV1");
    Utils.checkMainThread();

    if (data.length != 5) {
      Log.d(TAG, "Invalid length: " + data.length);
      return null;
    }

    int index = 0;

    final int version = data[index++];
    Utils.check(version == 1);

    final int deviceType = data[index++] + (data[index++] << 8);
    final int deviceNumber = data[index++] + (data[index++] << 8);

    Utils.check(index == data.length);

    return new ManufacturerDataV1(version, deviceType, deviceNumber);
  }

  private void connectToDevice(String address, BluetoothDevice device) {
    Log.d(TAG, "connectToDevice " + address);
    Utils.checkMainThread();

    Utils.check(!mPendingDevices.containsKey(address));

    BluetoothGatt gatt =
      device.connectGatt(mReactContext, false, mClientCallback);
    mPendingDevices.put(address, gatt);
  }

  private void startConnection(Connection connection) {
    final BluetoothGatt gatt = connection.mGatt;
    final String address = gatt.getDevice().getAddress();
    Log.d(TAG, "startConnection " + address);

    final BluetoothGattCharacteristic characteristic =
      connection.mCharacteristic;

    if (!gatt.setCharacteristicNotification(characteristic, true)) {
      Log.w(TAG, "Failed to enable notifications");
      cleanupConnection(connection);
      return;
    }

    Log.d(TAG, "Enabling notifications on " + address);

    final BluetoothGattDescriptor cccd =
      characteristic.getDescriptor(CCCD_UUID);
    Utils.check(cccd != null);

    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
    if (!gatt.writeDescriptor(cccd)) {
      Log.w(TAG, "Failed to start writing descriptor value: " + address);
      cleanupConnection(connection);
      return;
    }
  }

  private void onScanResult(ScanResult result) {
    Utils.checkMainThread();

    if (!mEnabled) {
      Log.d(TAG, "No longer enabled");
      return;
    }

    if (!mScanning) {
      Log.d(TAG, "No longer scanning");
      return;
    }

    final BluetoothDevice device = result.getDevice();
    final String address = device.getAddress();

    if (mScanBlacklist.contains(address) ||
        mPendingDevices.containsKey(address) ||
        mConnectionsByAddress.containsKey(address)) {
      return;
    }

    Log.d(TAG, "onScanResult " + address);

    if (mScanWhitelist.contains(address)) {
      connectToDevice(address, device);
      return;
    }

    final ScanRecord scanRecord = result.getScanRecord();

    final byte[] manufacturerData =
      scanRecord.getManufacturerSpecificData(ADVERTISING_MANUFACTURER_CODE);
    if (manufacturerData == null) {
      Log.d(TAG, "No manufacturer data advertised");
      mScanBlacklist.add(address);
      return;
    }

    final ManufacturerData parsedManufacturerData =
      parseManufacturerData(manufacturerData);
    if (parsedManufacturerData == null) {
      Log.d(TAG, "Failed to parse manufacturer data: " + manufacturerData);
      mScanBlacklist.add(address);
      return;
    }

    final Integer deviceNumber =
      parsedManufacturerData.getDeviceNumber();
    if (deviceNumber == null) {
      Log.d(TAG, "No device number advertised");
      mScanBlacklist.add(address);
      return;
    }

    final List<ParcelUuid> serviceUuids = scanRecord.getServiceUuids();
    if (serviceUuids.isEmpty()) {
      Log.d(TAG, "No services advertised");
      mScanBlacklist.add(address);
      return;
    }

    boolean shouldConnect = false;

    for (ParcelUuid parcelUuid : serviceUuids) {
      final UUID uuid = parcelUuid.getUuid();

      final ServiceInfo serviceInfo = mServices.get(uuid);
      if (serviceInfo == null) {
        Log.d(TAG, "Ignoring unknown service advertisement " + uuid);
        continue;
      }

      if (!serviceInfo.mEnabled) {
        Log.d(TAG, "Ignoring disabled service advertisement " + uuid);
        continue;
      }

      if (uuid.equals(RegionMonitor.CONFIG_BEACON_UUID)) {
        Log.d(TAG, "Advertising the config service");
        shouldConnect = true;
        break;
      }

      if (serviceInfo.mDeviceNumbersBeaconing.contains(deviceNumber)) {
        Log.d(TAG, "Device number " + deviceNumber + " is beaconing");
        shouldConnect = true;
        break;
      }

      if (serviceInfo.mDeviceNumbersRequested.contains(deviceNumber)) {
        Log.d(TAG, "Connection requested to device number " + deviceNumber);
        shouldConnect = true;
        break;
      }
    }

    if (!shouldConnect) {
      Log.d(TAG, "Ignoring");
      mScanBlacklist.add(address);
      return;
    }

    mScanWhitelist.add(address);
    connectToDevice(address, device);
  }

  private void cancelConnection(String address) {
    Log.d(TAG, "cancelConnection " + address);
    Utils.checkMainThread();

    final BluetoothGatt device = mPendingDevices.get(address);
    if (device != null) {
      mPendingDevices.remove(address);
      device.disconnect();
      device.close();
    }
  }

  private void sendOutgoingData(Connection connection) {
    Log.d(TAG, "sendOutgoingData: " + connection.mId);
    Utils.checkMainThread();
    Utils.check(connection.mCurrentOutgoingData == null);

    final BluetoothGatt gatt = connection.mGatt;
    final BluetoothGattCharacteristic characteristic =
      connection.mCharacteristic;

    if (connection.mOutgoingQueue.isEmpty()) {
      Log.d(TAG, "All data written");
      if (connection.mFinished) {
        final BluetoothGattDescriptor descriptor =
          characteristic.getDescriptor(CCCD_UUID);

        if (!gatt.setCharacteristicNotification(characteristic, false)) {
          Log.w(TAG, "Failed to disable notifications");
        }

        descriptor.setValue(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);
        if (!gatt.writeDescriptor(descriptor)) {
          Log.w(TAG, "Failed to disable notifications");
          cleanupConnection(connection);
        }
      }
      return;
    }

    collectOutgoingData(connection);
    Utils.check(connection.mCurrentOutgoingData != null);

    Log.d(TAG, "Sending " +  connection.mCurrentOutgoingData.length + " bytes");
    characteristic.setValue(connection.mCurrentOutgoingData);
    if (!gatt.writeCharacteristic(characteristic)) {
      Log.w(TAG, "Failed to write characteristic");
      cleanupConnection(connection);
    }
  }

  private void collectOutgoingData(Connection connection) {
    Log.d(TAG, "collectOutgoingData " + connection.mId);
    Utils.checkMainThread();
    Utils.check(!connection.mOutgoingQueue.isEmpty());
    Utils.check(connection.mCurrentOutgoingData == null);

    // Build up a contiguous chunk of data to send.
    final List<byte[]> chunksToSend = new ArrayList<>();
    int chunksToSendLength = 0;

    int outgoingIndex = 0;
    while (outgoingIndex < connection.mOutgoingQueue.size() &&
           chunksToSendLength < MAX_WRITE_BYTES) {
      final byte[] chunk = connection.mOutgoingQueue.get(outgoingIndex);

      final int availableLength = MAX_WRITE_BYTES - chunksToSendLength;
      Utils.check(availableLength > 0);

      if (chunk.length > availableLength) {
        // If we can't fit all the data then slice it up for the next chunk.
        final byte[] chunkToSend =
          Arrays.copyOfRange(chunk, 0, availableLength);
        chunksToSend.add(chunkToSend);

        final byte[] chunkToKeep =
          Arrays.copyOfRange(chunk, availableLength, chunk.length);
        connection.mOutgoingQueue.set(outgoingIndex, chunkToKeep);

        chunksToSendLength += availableLength;
        break;
      }

      chunksToSend.add(chunk);
      chunksToSendLength += chunk.length;
      outgoingIndex += 1;
    }

    Utils.check(!chunksToSend.isEmpty());
    Utils.check(chunksToSendLength > 0);

    // Pull any completely consumed data out of the array.
    if (outgoingIndex > 0) {
      connection.mOutgoingQueue.subList(0, outgoingIndex).clear();
    }

    if (chunksToSend.size() == 1) {
      connection.mCurrentOutgoingData = chunksToSend.get(0);
    } else {
      final byte[] contiguous = new byte[chunksToSendLength];
      int contiguousOffset = 0;
      for (byte[] chunk : chunksToSend) {
        System.arraycopy(chunk, 0, contiguous, contiguousOffset, chunk.length);
      }
      connection.mCurrentOutgoingData = contiguous;
    }

    Utils.check(connection.mCurrentOutgoingData.length == chunksToSendLength);
  }

  private void onScanFailed(int errorCode) {
    Log.w(TAG, "Failed to start scan: " + errorCode);
    Utils.checkMainThread();

    updateScanningState();
  }

  private void onConnectionStateChange(BluetoothDevice device,
                                       int status,
                                       int newState) {
    final String address = device.getAddress();
    Log.d(TAG,
          "onConnectionStateChange: server " + address + ", " + status + ", " +
          newState);
    Utils.checkMainThread();
  }

  private void onServiceAdded(final int status,
                              final BluetoothGattService service) {
    final UUID uuid = service.getUuid();
    Log.d(TAG, "onServiceAdded: " + status + ", " + uuid);
    Utils.checkMainThread();

    if (mGattServer == null) {
      Log.d(TAG, "GATT server no longer active");
      return;
    }

    final ServiceInfo thisServiceInfo = mServices.get(uuid);
    if (thisServiceInfo == null) {
      Log.d(TAG, "Service no longer desired");
    } else {
      Utils.check(thisServiceInfo.mAdding);
      Utils.check(!thisServiceInfo.mAdded);

      thisServiceInfo.mAdding = false;

      if (status == 0) {
        if (thisServiceInfo.mRemoveAfterAdding) {
          if (!mGattServer.removeService(thisServiceInfo.mService)) {
            Log.w(TAG, "Failed to remove service " + uuid);
          }
        } else {

          thisServiceInfo.mAdded = true;

          for (Connection connection : mConnectionsById.values()) {
            if (connection.mServiceUuid.equals(uuid)) {
              startConnection(connection);
            }
          }
        }
      } else {
        Log.w(TAG, "Failed to add service " + uuid + ": " + status);
      }
    }

    for (ServiceInfo serviceInfo : mServices.values()) {
      if (!serviceInfo.mAdded && !serviceInfo.mAdding) {
        Log.d(TAG, "Adding service " + serviceInfo.mService.getUuid());
        serviceInfo.mAdding = true;
        mGattServer.addService(serviceInfo.mService);
        break;
      }
    }
  }

  private void onCharacteristicReadRequest(BluetoothDevice device,
                                           int requestId,
                                           int offset,
                                           BluetoothGattCharacteristic characteristic) {
    final String address = device.getAddress();
    Log.d(TAG, "onCharacteristicReadRequest " + address);
    Utils.checkMainThread();

    if (mGattServer == null) {
      Log.e(TAG, "onCharacteristicReadRequest after server closed");
      return;
    }

    // We don't support any reads.
    Log.w(TAG, "Ignoring unsupported read request");
    mGattServer.sendResponse(device,
                             requestId,
                             BluetoothGatt.GATT_READ_NOT_PERMITTED,
                             0,
                             null);
  }

  private void onCharacteristicWriteRequest(BluetoothDevice device,
                                            int requestId,
                                            BluetoothGattCharacteristic characteristic,
                                            boolean preparedWrite,
                                            boolean responseNeeded,
                                            int offset,
                                            byte[] value) {
    final String address = device.getAddress();
    Log.d(TAG, "onCharacteristicWriteRequest " + address);
    Utils.checkMainThread();

    if (mGattServer == null) {
      Log.e(TAG, "onCharacteristicWriteRequest after server closed");
      return;
    }

    final Connection connection = mConnectionsByAddress.get(address);
    if (connection == null) {
      Log.w(TAG, "No connection for " + address);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_WRITE_NOT_PERMITTED,
                                 0,
                                 null);
      }
      return;
    }

    final UUID characteristicUuid = characteristic.getUuid();
    if (!characteristicUuid.equals(CHARACTERISTIC_UUID)) {
      Log.w(TAG, "Ignoring write for unsupported characteristic " + address);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_WRITE_NOT_PERMITTED,
                                 0,
                                 null);
      }
      return;
    }

    final UUID serviceUuid = characteristic.getService().getUuid();
    if (!serviceUuid.equals(connection.mServiceUuid)) {
      Log.w(TAG, "Ignoring write for unsupported service " + address);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_WRITE_NOT_PERMITTED,
                                 0,
                                 null);
      }
      return;
    }

    if (!connection.mSubscribed || connection.mUnsubscribed) {
      Log.w(TAG, "Ignoring write when not subscribed " + address);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_WRITE_NOT_PERMITTED,
                                 0,
                                 null);
      }
      return;
    }


    if (responseNeeded) {
      mGattServer.sendResponse(device,
                               requestId,
                               BluetoothGatt.GATT_SUCCESS,
                               0,
                               null);
    }

    if (preparedWrite) {
      if (connection.mPreparedWriteValue == null) {
        connection.mPreparedWriteValue = value;
      } else {
        final byte[] oldValue = connection.mPreparedWriteValue;
        byte[] newValue = new byte[oldValue.length + value.length];

        System.arraycopy(oldValue, 0, newValue, 0, oldValue.length);
        System.arraycopy(value, 0, newValue, oldValue.length, newValue.length);

        connection.mPreparedWriteValue = newValue;
      }
    } else {
      mBridge.sendIncomingData(connection.mId, value);
    }
  }

  private void onDescriptorReadRequest(BluetoothDevice device,
                                       int requestId,
                                       int offset,
                                       BluetoothGattDescriptor descriptor) {
    final String address = device.getAddress();
    Log.d(TAG, "onDescriptorReadRequest " + address);
    Utils.checkMainThread();

    if (mGattServer == null) {
      Log.e(TAG, "onDescriptorReadRequest after server closed");
      return;
    }

    final UUID uuid = descriptor.getUuid();
    if (!uuid.equals(CCCD_UUID)) {
      Log.d(TAG, "Ignoring unknown descriptor read request " + uuid);
      mGattServer.sendResponse(device,
                               requestId,
                               BluetoothGatt.GATT_READ_NOT_PERMITTED,
                               0,
                               null);
      return;
    }

    if (offset >= BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE.length) {
      Log.w(TAG, "Invalid offset for CCCD: " + offset);
      mGattServer.sendResponse(device,
                               requestId,
                               BluetoothGatt.GATT_INVALID_OFFSET,
                               0,
                               null);
      return;
    }

    byte[] value;

    final Connection connection = mConnectionsByAddress.get(address);
    if (connection == null) {
      Log.w(TAG, "No connection for " + address);
      value = BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE;
    } else if (!connection.mSubscribed || connection.mUnsubscribed) {
      value = BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE;
    } else {
      value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE;
    }

    if (offset != 0) {
      value = Arrays.copyOfRange(value, offset, value.length);
    }

    mGattServer.sendResponse(device,
                             requestId,
                             BluetoothGatt.GATT_SUCCESS,
                             offset,
                             value);
  }

  private void onDescriptorWriteRequest(BluetoothDevice device,
                                        int requestId,
                                        BluetoothGattDescriptor descriptor,
                                        boolean preparedWrite,
                                        boolean responseNeeded,
                                        int offset,
                                        byte[] value) {
    final String address = device.getAddress();
    Log.d(TAG, "onDescriptorWriteRequest " + address);
    Utils.checkMainThread();

    if (mGattServer == null) {
      Log.e(TAG, "onDescriptorWriteRequest after server closed");
      return;
    }

    if (preparedWrite) {
      Log.w(TAG, "Prepared writes not supported");
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_WRITE_NOT_PERMITTED,
                                 0,
                                 null);
      }
      return;
    }

    final UUID uuid = descriptor.getUuid();
    if (!uuid.equals(CCCD_UUID)) {
      Log.d(TAG, "Ignoring unknown descriptor write request " + uuid);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_WRITE_NOT_PERMITTED,
                                 0,
                                 null);
      }
      return;
    }

    final int maxLength =
      BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE.length;

    if (offset >= maxLength) {
      Log.w(TAG, "Invalid offset for CCCD: " + offset);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_INVALID_OFFSET,
                                 0,
                                 null);
      }
      return;
    }

    if (offset + value.length > maxLength) {
      Log.w(TAG, "Invalid length for CCCD: " + value);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_INVALID_ATTRIBUTE_LENGTH,
                                 0,
                                 null);
      }
      return;
    }

    if (offset > 0) {
      // The first byte is the only one we care about. Everything else should be
      // 0.
      int response = BluetoothGatt.GATT_SUCCESS;
      for (int index = offset; index < value.length; index++) {
        if (value[index] != 0) {
          response = BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED;
          break;
        }
      }
      if (responseNeeded) {
        mGattServer.sendResponse(device, requestId, response, 0, null);
      }
      return;
    }

    final boolean valueIsUnsubscribe =
      Arrays.equals(value, BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);
    final boolean valueIsSubscribe =
      Arrays.equals(value, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
    Utils.check(!(valueIsUnsubscribe && valueIsSubscribe));

    if (!valueIsUnsubscribe && !valueIsSubscribe) {
      Log.w(TAG, "Invalid value for CCCD: " + value);
      if (responseNeeded) {
        mGattServer.sendResponse(device,
                                 requestId,
                                 BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                                 0,
                                 null);
      }
      return;
    }


    if (responseNeeded) {
      mGattServer.sendResponse(device,
                               requestId,
                               BluetoothGatt.GATT_SUCCESS,
                               0,
                               null);
    }

    final Connection connection = mConnectionsByAddress.get(address);
    if (connection == null) {
      Log.w(TAG, "No connection for " + address);
    } else if (valueIsSubscribe) {
      if (connection.mSubscribed) {
        Log.w(TAG, "Attempted to subscribe more than once " + address);
      } else if (connection.mUnsubscribed) {
        Log.w(TAG, "Connection was already unsubscribed " + address);
      } else {
        connection.mSubscribed = true;
        mBridge.sendConnect(connection.mId);
      }
    } else if (valueIsUnsubscribe) {
      if (connection.mUnsubscribed) {
        Log.w(TAG, "Attempted to unsubscribe more than once " + address);
      } else if (!connection.mSubscribed) {
        Log.w(TAG, "Connection is not yet subscribed " + address);
      } else {
        connection.mUnsubscribed = true;
        mBridge.sendEnd(connection.mId);
      }
    }
  }

  private void onExecuteWrite(BluetoothDevice device,
                              int requestId,
                              boolean execute) {
    final String address = device.getAddress();
    Log.d(TAG, "onExecuteWrite " + address + ", " + execute);
    Utils.checkMainThread();

    if (mGattServer == null) {
      Log.e(TAG, "onExecuteWrite after server closed");
      return;
    }

    final Connection connection = mConnectionsByAddress.get(address);
    if (connection == null) {
      Log.w(TAG, "No connection for " + address);
    } else {
      if (execute && connection.mPreparedWriteValue != null) {
        mBridge.sendIncomingData(connection.mId,
                                 connection.mPreparedWriteValue);
      }
      connection.mPreparedWriteValue = null;
    }

    mGattServer.sendResponse(device,
                             requestId,
                             BluetoothGatt.GATT_SUCCESS,
                             0,
                             null);
  }

  private void onConnectionStateChange(BluetoothGatt gatt,
                                       int status,
                                       int newState) {
    final String address = gatt.getDevice().getAddress();
    Log.d(TAG,
          "onConnectionStateChange: client " + address + ", " + status + ", " +
          newState);
    Utils.checkMainThread();
    Utils.check(newState == BluetoothProfile.STATE_CONNECTED ||
                newState == BluetoothProfile.STATE_DISCONNECTED);

    if (newState == BluetoothProfile.STATE_DISCONNECTED) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        Log.i(TAG, "Disconnected from " + address);
      } else {
        Log.w(TAG, "Disconnected from " + address + " with error: " + status);
      }

      final Connection connection = mConnectionsByAddress.get(address);
      if (connection == null) {
        cancelConnection(address);
        gatt.close();
      } else {
        connection.mDisconnected = true;
        cleanupConnection(connection);
      }

      return;
    }

    if (!mPendingDevices.containsKey(address)) {
      Log.w(TAG,
            "No longer trying to connect to " + address + ", disconnecting");
      gatt.disconnect();
      gatt.close();
      return;
    }

    if (!mEnabled) {
      Log.d(TAG, "No longer enabled, disconnecting " + address);
      cancelConnection(address);
      return;
    }

    if (status != BluetoothGatt.GATT_SUCCESS) {
      Log.w(TAG, "Failed to connect to " + address + ", retrying: " + status);
      gatt.connect();
      return;
    }

    Log.i(TAG, "Connected to " + address);

    if (!gatt.discoverServices()) {
      Log.w(TAG, "Failed to start discovering services for " + address);
    }
  }

  private void onServicesDiscovered(BluetoothGatt gatt, int status) {
    final String address = gatt.getDevice().getAddress();
    Log.d(TAG, "onServicesDiscovered: " + address);
    Utils.checkMainThread();

    if (!mPendingDevices.containsKey(address)) {
      Log.d(TAG,
        "No longer trying to connect to " + address + ", disconnecting");
      gatt.disconnect();
      gatt.close();
      return;
    }

    if (!mEnabled) {
      Log.d(TAG, "No longer enabled, disconnecting " + address);
      cancelConnection(address);
      return;
    }

    if (status != BluetoothGatt.GATT_SUCCESS) {
      Log.w(TAG,
            "Failed to discover services for " + address + ", retrying: " +
            status);
      if (!gatt.discoverServices()) {
        Log.w(TAG, "Failed to start discovering services for " + address);
      }
      return;
    }

    BluetoothGattService socketService = null;
    BluetoothGattCharacteristic socketCharacteristic = null;

    for (BluetoothGattService service : gatt.getServices()) {
      final UUID uuid = service.getUuid();
      final ServiceInfo serviceInfo = mServices.get(uuid);
      if (serviceInfo == null || !serviceInfo.shouldScan()) {
        continue;
      }

      socketService = service;

      BluetoothGattCharacteristic characteristic =
        service.getCharacteristic(CHARACTERISTIC_UUID);
      if (characteristic == null) {
        continue;
      }

      final int props = characteristic.getProperties();
      if (((props & CHARACTERISTIC_PROPERTIES) != CHARACTERISTIC_PROPERTIES)) {
        continue;
      }

      final BluetoothGattDescriptor cccd =
        characteristic.getDescriptor(CCCD_UUID);
      if (cccd == null) {
        continue;
      }

      socketCharacteristic = characteristic;

      if (!uuid.equals(RegionMonitor.CONFIG_BEACON_UUID)) {
        break;
      }
    }

    if (socketService == null) {
      Log.w(TAG, "No socket service available on " + address);
      mScanBlacklist.add(address);
      cancelConnection(address);
      return;
    }

    if (socketCharacteristic == null) {
      Log.w(TAG, "No socket characteristic available on " + address);
      mScanBlacklist.add(address);
      cancelConnection(address);
      return;
    }

    final Connection connection = new Connection(gatt, socketCharacteristic);
    mConnectionsById.put(connection.mId, connection);
    mConnectionsByAddress.put(address, connection);

    mPendingDevices.remove(address);

    ServiceInfo serviceInfo = mServices.get(socketService.getUuid());
    if (!serviceInfo.mAdded) {
      // |startConnection| will be called when the service is added.
      Utils.check(serviceInfo.mAdding);
      return;
    }

    startConnection(connection);
  }

  private void onCharacteristicWrite(BluetoothGatt gatt,
                                     BluetoothGattCharacteristic characteristic,
                                     int status) {
    final String address = gatt.getDevice().getAddress();
    Log.d(TAG, "onCharacteristicWrite " + address);
    Utils.checkMainThread();

    final Connection connection = mConnectionsByAddress.get(address);
    if (connection == null) {
      Log.w(TAG, "No connection for " + address);
      return;
    }

    if (characteristic != connection.mCharacteristic) {
      Log.w(TAG, "Different characteristic...");
      cleanupConnection(connection);
      return;
    }

    Utils.check(connection.mCurrentOutgoingData != null);
    connection.mCurrentOutgoingData = null;

    if (status != BluetoothGatt.GATT_SUCCESS) {
      Log.w(TAG, "Failed to write characteristic: " + status);
      cleanupConnection(connection);
      return;
    }

    sendOutgoingData(connection);
  }

  private void onDescriptorWrite(BluetoothGatt gatt,
                                 BluetoothGattDescriptor descriptor,
                                 int status) {
    final String address = gatt.getDevice().getAddress();
    Log.d(TAG, "onDescriptorWrite " + address);
    Utils.checkMainThread();

    final UUID uuid = descriptor.getUuid();
    if (!uuid.equals(CCCD_UUID)) {
      Log.d(TAG, "Ignoring unknown descriptor write callback" + uuid);
      return;
    }

    final Connection connection = mConnectionsByAddress.get(address);
    if (connection == null) {
      Log.d(TAG, "Disconnecting " + address);
      gatt.disconnect();
      gatt.close();
      return;
    }

    if (!mEnabled) {
      Log.d(TAG, "No longer enabled, disconnecting " + address);
      cleanupConnection(connection);
      return;
    }

    if (status != BluetoothGatt.GATT_SUCCESS) {
      Log.w(TAG, "Failed to write descriptor: " + address + ", " + status);
      cleanupConnection(connection);
      return;
    }
  }

  private void onReadRemoteRssi(final BluetoothGatt gatt,
                                int rssi,
                                int status) {
    final String address = gatt.getDevice().getAddress();
    Log.d(TAG, "onReadRemoteRssi " + address + ", " + rssi);
    Utils.checkMainThread();

    final Connection connection = mConnectionsByAddress.get(address);
    if (connection == null) {
      return;
    }

    if (!connection.mRssiUpdatesEnabled) {
      return;
    }

    if (status == 0) {
      mBridge.sendRssiUpdate(connection.mId, rssi);
    } else {
      Log.w(TAG, "Failed to read rssi for " + address + ", " + status);
    }

    Utils.postToMainThreadWithDelay(new Runnable() {
      @Override
      public void run() {
        if (!gatt.readRemoteRssi()) {
          Log.w(TAG, "Failed to start reading rssi for " + address);
        }
      }
    }, 500);
  }

  ReactApplicationContext reactContext() {
    return mReactContext;
  }

  void setEnabled() {
    Log.d(TAG, "setEnabled");
    Utils.checkMainThread();

    if (mEnabled) {
      return;
    }
    mEnabled = true;

    maybeAddServices();

    if (mUnconfiguredDevicesInRange) {
      Log.i(TAG, "Informing JS that there are unconfigured devices in range");
      mBridge.sendUnconfiguredDevicesInRange(true);
    } else {
      Log.i(TAG, "Informing JS that no unconfigured devices are in range");
      mBridge.sendUnconfiguredDevicesInRange(false);
    }

    updateScanningState();
  }

  void setDisabled() {
    Log.d(TAG, "setDisabled");
    Utils.checkMainThread();

    if (!mEnabled) {
      return;
    }
    mEnabled = false;

    removeServices();
    mUnconfiguredDevicesInRange = false;

    updateScanningState();
  }

  void regionAdded(final UUID uuid) {
    Log.d(TAG, "regionAdded " + uuid);
    Utils.checkMainThread();

    if (uuid.equals(RegionMonitor.CONFIG_BEACON_UUID)) {
      return;
    }

    if (mServices.containsKey(uuid)) {
      Log.d(TAG, "Already monitoring this region " + uuid);
      return;
    }

    mRegionMonitor.startMonitoring(uuid);

    final Service service = new Service(uuid);
    final ServiceInfo thisServiceInfo = new ServiceInfo(service, true);
    mServices.put(uuid, thisServiceInfo);

    if (mGattServer != null) {
      boolean addServiceNow = true;

      for (ServiceInfo serviceInfo : mServices.values()) {
        if (serviceInfo.mAdding) {
          addServiceNow = false;
          break;
        }
      }

      if (addServiceNow) {
        Log.d(TAG, "Adding service " + uuid);
        thisServiceInfo.mAdding = true;
        mGattServer.addService(service);
      }
    }

    updateScanningState();
  }

  void regionRemoved(final UUID uuid) {
    Log.d(TAG, "regionRemoved " + uuid);
    Utils.checkMainThread();

    if (uuid.equals(RegionMonitor.CONFIG_BEACON_UUID)) {
      return;
    }

    Utils.check(mServices.containsKey(uuid));

    mRegionMonitor.stopMonitoring(uuid);

    removeAndCleanupService(uuid);
    mServices.remove(uuid);

    updateScanningState();
  }

  void removeAllBeaconUuids() {
    Log.d(TAG, "removeAllBeaconUuids");
    Utils.checkMainThread();

    mRegionMonitor.reset();

    final Set<UUID> uuids = new HashSet<UUID>(mServices.keySet());
    uuids.remove(RegionMonitor.CONFIG_BEACON_UUID);

    for (UUID uuid : uuids) {
      removeAndCleanupService(uuid);
      mServices.remove(uuid);
    }

    updateScanningState();
  }

  void scanForUnconfiguredDevices(boolean shouldScan) {
    Log.d(TAG, "scanForUnconfiguredDevices: " + shouldScan);
    Utils.checkMainThread();

    mShouldScanForUnconfiguredDevices = shouldScan;

    final ServiceInfo serviceInfo =
      mServices.get(RegionMonitor.CONFIG_BEACON_UUID);
    serviceInfo.mEnabled = shouldScan && mInForeground;

    updateScanningState();
  }

  void scanForDevice(UUID serviceUuid,
                     int accountDeviceNumber,
                     boolean shouldScan) {
    Log.d(TAG,
          "scanForDevice: " + serviceUuid + ", " + accountDeviceNumber + ", " +
          shouldScan);
    Utils.checkMainThread();

    final ServiceInfo serviceInfo = mServices.get(serviceUuid);
    if (serviceInfo == null) {
      Log.w(TAG, "Not monitoring " + serviceUuid);
      return;
    }

    if (shouldScan) {
      serviceInfo.mDeviceNumbersRequested.add(accountDeviceNumber);
    } else {
      serviceInfo.mDeviceNumbersRequested.remove(accountDeviceNumber);
    }

    updateScanningState();
  }

  void sendOutgoing(int connectionId, byte[] data) {
    Log.d(TAG, "sendOutgoing: " + connectionId + ", <" + data.length + ">");
    Utils.checkMainThread();

    final Connection connection = mConnectionsById.get(connectionId);
    if (connection == null) {
      Log.w(TAG, "No connection " + connectionId);
      return;
    }

    connection.mOutgoingQueue.add(data);

    if (connection.mCurrentOutgoingData == null) {
      sendOutgoingData(connection);
    }
  }

  void enableRssiUpdates(int connectionId, boolean enable) {
    Log.d(TAG, "enableRssiUpdates " + connectionId + ", " + enable);
    Utils.checkMainThread();

    final Connection connection = mConnectionsById.get(connectionId);
    if (connection == null) {
      Log.w(TAG, "No connection " + connectionId);
      return;
    }

    if (connection.mRssiUpdatesEnabled == enable) {
      return;
    }

    connection.mRssiUpdatesEnabled = enable;
    if (!enable) {
      return;
    }

    if (!connection.mGatt.readRemoteRssi()) {
      Log.w(TAG, "Failed to start reading rssi for " + connection.mAddress);
    }
  }

  void finish(int connectionId) {
    Log.d(TAG, "finish " + connectionId);
    Utils.checkMainThread();

    final Connection connection = mConnectionsById.get(connectionId);
    if (connection == null) {
      Log.w(TAG, "No connection " + connectionId);
      return;
    }

    if (connection.mFinished) {
      Log.d(TAG, "Already finished");
      return;
    }
    connection.mFinished = true;

    if (connection.mCurrentOutgoingData != null) {
      Log.d(TAG,
            "Waiting for all outgoing data to be written before unsubscribing");
      return;
    }

    final BluetoothGatt gatt = connection.mGatt;
    final BluetoothGattCharacteristic characteristic =
      connection.mCharacteristic;
    final BluetoothGattDescriptor descriptor =
      characteristic.getDescriptor(CCCD_UUID);

    if (!gatt.setCharacteristicNotification(characteristic, false)) {
      Log.w(TAG, "Failed to disable notifications");
    }

    descriptor.setValue(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);
    if (!gatt.writeDescriptor(descriptor)) {
      Log.w(TAG, "Failed to disable notifications");
      cleanupConnection(connection);
    }
  }

  void disconnect(int connectionId) {
    Log.d(TAG, "finish " + connectionId);
    Utils.checkMainThread();

    final Connection connection = mConnectionsById.get(connectionId);
    if (connection == null) {
      Log.w(TAG, "No connection " + connectionId);
      return;
    }

    cleanupConnection(connection);
  }

  void onHostResume() {
    Log.d(TAG, "onHostResume");
    Utils.checkMainThread();

    if (mInForeground) {
      return;
    }
    mInForeground = true;

    mRegionMonitor.onHostResume();

    final ServiceInfo serviceInfo =
      mServices.get(RegionMonitor.CONFIG_BEACON_UUID);
    serviceInfo.mEnabled = mShouldScanForUnconfiguredDevices;

    updateScanningState();
  }

  void onHostPause() {
    Log.d(TAG, "onHostPause");
    Utils.checkMainThread();

    if (!mInForeground) {
      return;
    }
    mInForeground = false;

    mRegionMonitor.onHostPause();

    final ServiceInfo serviceInfo =
      mServices.get(RegionMonitor.CONFIG_BEACON_UUID);
    serviceInfo.mEnabled = false;

    updateScanningState();
  }

  void onHostDestroy() {
    Log.d(TAG, "onHostPause");
    Utils.checkMainThread();

    mRegionMonitor.onHostDestroy();
  }

  void bluetoothStateChanged() {
    Log.d(TAG, "bluetoothStateChanged");
    Utils.checkMainThread();

    updateScanningState();
  }

  void regionEntered(UUID uuid) {
    Log.d(TAG, "regionEntered: " + uuid);
    Utils.checkMainThread();

    final ServiceInfo serviceInfo = mServices.get(uuid);
    if (serviceInfo == null) {
      Log.d(TAG, "No longer monitoring region");
      return;
    }

    serviceInfo.mInBeaconRange = true;

    if (uuid.equals(RegionMonitor.CONFIG_BEACON_UUID) &&
        !mUnconfiguredDevicesInRange) {
      mUnconfiguredDevicesInRange = true;
      if (mEnabled) {
        Log.i(TAG, "Informing JS that there are unconfigured devices in range");
        mBridge.sendUnconfiguredDevicesInRange(true);
      }
    }

    updateScanningState();
  }

  void regionExited(UUID uuid) {
    Log.d(TAG, "regionExited: " + uuid);
    Utils.checkMainThread();

    final ServiceInfo serviceInfo = mServices.get(uuid);
    if (serviceInfo == null) {
      Log.d(TAG, "No longer monitoring region");
      return;
    }

    serviceInfo.mInBeaconRange = false;

    if (uuid.equals(RegionMonitor.CONFIG_BEACON_UUID) &&
        mUnconfiguredDevicesInRange) {
      mUnconfiguredDevicesInRange = false;
      if (mEnabled) {
        Log.i(TAG, "Informing JS that no unconfigured devices are in range");
        mBridge.sendUnconfiguredDevicesInRange(false);
      }
    }

    updateScanningState();
  }

  void regionBeacons(UUID uuid, Set<Integer> deviceNumbers) {
    Log.d(TAG, "regionExited: " + uuid);
    Utils.checkMainThread();

    final ServiceInfo serviceInfo = mServices.get(uuid);
    if (serviceInfo == null) {
      Log.d(TAG, "No longer monitoring region");
      return;
    }

    Set<Integer> foundDeviceNumbers = new HashSet<>(deviceNumbers);
    foundDeviceNumbers.removeAll(serviceInfo.mDeviceNumbersBeaconing);

    Set<Integer> lostDeviceNumbers = serviceInfo.mDeviceNumbersBeaconing;
    lostDeviceNumbers.removeAll(deviceNumbers);

    serviceInfo.mDeviceNumbersBeaconing = deviceNumbers;

    for (Integer deviceNumber : foundDeviceNumbers) {
      mBridge.sendDevicesBeaconing(uuid, deviceNumber, true);
    }

    for (Integer deviceNumber : lostDeviceNumbers) {
      mBridge.sendDevicesBeaconing(uuid, deviceNumber, false);
    }

    updateScanningState();
  }

}
