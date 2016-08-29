package com.silklabs.react.blesocket;

import android.content.Context;
import android.content.Intent;
import android.os.RemoteException;
import android.util.Log;
import com.facebook.react.bridge.ReactApplicationContext;
import org.altbeacon.beacon.Beacon;
import org.altbeacon.beacon.BeaconManager;
import org.altbeacon.beacon.BeaconParser;
import org.altbeacon.beacon.Identifier;
import org.altbeacon.beacon.MonitorNotifier;
import org.altbeacon.beacon.RangeNotifier;
import org.altbeacon.beacon.Region;
import org.altbeacon.beacon.logging.LogManager;
import org.altbeacon.beacon.logging.Loggers;
import org.altbeacon.beacon.service.BeaconService;
import org.altbeacon.beacon.service.MonitoringStatus;
import org.altbeacon.beacon.startup.BootstrapNotifier;
import org.altbeacon.beacon.startup.RegionBootstrap;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public class RegionMonitor implements BootstrapNotifier, RangeNotifier {

  private static final String TAG = "RegionMonitor";

  // We only look for beacons that use the iBeacon layout.
  private static String BEACON_LAYOUT_IBEACON =
    "m:0-3=4c000215,i:4-19,i:20-21,i:22-23,p:24-24";
  private static long BEACON_FOREGROUND_SCAN_MS = 2200L;
  private static long BEACON_FOREGROUND_BETWEEN_MS = 500L;
  private static long BEACON_BACKGROUND_SCAN_MS = 5000L;
  private static long BEACON_BACKGROUND_BETWEEN_MS = 10000L;
  private static long BEACON_REGION_EXIT_MS = 30000L;

  private static final String CONFIG_BEACON_UUID_STRING =
    "cefa2202-53c7-4285-ac1b-a6e6eb00bb79";
  static final UUID CONFIG_BEACON_UUID =
    UUID.fromString(CONFIG_BEACON_UUID_STRING);

  private class RegionInfo {
    final Region mRegion;
    final UUID mUuid;
    Integer mState;
    boolean mRanging = false;
    Set<Integer> mDeviceNumbersBeaconing = new HashSet<>();

    RegionInfo(Region region) {
      mRegion = region;
      mUuid = region.getId1().toUuid();
    }

    RegionInfo(Region region, UUID uuid) {
      Utils.check(uuid.equals(region.getId1().toUuid()));
      mRegion = region;
      mUuid = uuid;
    }
  }

  private final BLESocketManager mSocketManager;
  private BeaconManager mBeaconManager;
  private RegionBootstrap mBeaconBootstrap;

  private final Map<UUID, RegionInfo> mRegions = new HashMap<>();

  RegionMonitor(final ReactApplicationContext reactContext,
                BLESocketManager socketManager) {
    Log.d(TAG, "constructor");

    Utils.check(reactContext != null);
    Utils.check(socketManager != null);

    mSocketManager = socketManager;

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        initMainThread(reactContext);
      }
    });
  }

  private void initMainThread(ReactApplicationContext reactContext) {
    Log.d(TAG, "initMainThread");
    Utils.checkMainThread();

    if (BuildConfig.DEBUG || true /* XXX REMOVE BEFORE RELEASE */) {
      LogManager.setLogger(Loggers.verboseLogger());
      LogManager.setVerboseLoggingEnabled(true);
    } else {
      LogManager.setLogger(Loggers.warningLogger());
      LogManager.setVerboseLoggingEnabled(false);
    }

    final Context context = reactContext.getApplicationContext();

    // Make sure to kill any previous version of the service because otherwise
    // the BeaconParser we add below might not get registered.
    final Intent intent = new Intent(context, BeaconService.class);
    context.stopService(intent);

    mBeaconManager = BeaconManager.getInstanceForApplication(context);

    final BeaconParser iBeaconParser = new BeaconParser("iBeacon");
    iBeaconParser.setBeaconLayout(BEACON_LAYOUT_IBEACON);

    final List<BeaconParser> parsers = mBeaconManager.getBeaconParsers();
    parsers.clear();
    parsers.add(iBeaconParser);

    mBeaconManager.setRegionStatePeristenceEnabled(true);
    mBeaconManager.setForegroundScanPeriod(BEACON_FOREGROUND_SCAN_MS);
    mBeaconManager.setForegroundBetweenScanPeriod(BEACON_FOREGROUND_BETWEEN_MS);
    mBeaconManager.setBackgroundScanPeriod(BEACON_BACKGROUND_SCAN_MS);
    mBeaconManager.setBackgroundBetweenScanPeriod(BEACON_BACKGROUND_BETWEEN_MS);
    mBeaconManager.setRegionExitPeriod(BEACON_REGION_EXIT_MS);
    mBeaconManager.setBackgroundMode(false);
    mBeaconManager.addRangeNotifier(this);

    final MonitoringStatus monitoringStatus =
      MonitoringStatus.getInstanceForApplication(reactContext);

    final List<Region> regions = new ArrayList<>(monitoringStatus.regions());
    mBeaconBootstrap = new RegionBootstrap(this, regions);

    // We always monitor CONFIG_BEACON_UUID.
    startMonitoring(CONFIG_BEACON_UUID);

    for (Region region: regions) {
      if (region.getId1().toUuid().equals(CONFIG_BEACON_UUID)) {
        continue;
      }

      final UUID uuid = region.getId1().toUuid();
      Utils.check(!mRegions.containsKey(uuid));

      mSocketManager.regionAdded(uuid);

      Utils.check(mRegions.containsKey(uuid));
    }
  }

  void cleanupMainThread() {
    Log.d(TAG, "cleanupMainThread");
    Utils.checkMainThread();

    if (mBeaconBootstrap != null) {
      mBeaconBootstrap.disable();
      mBeaconBootstrap = null;
    }

    if (mBeaconManager != null) {
      mBeaconManager.removeRangeNotifier(this);
      mBeaconManager = null;
    }

    mRegions.clear();
  }

  void onHostResume() {
    Log.d(TAG, "onHostResume");
    Utils.checkMainThread();

    mBeaconManager.setBackgroundMode(false);
  }

  void onHostPause() {
    Log.d(TAG, "onHostPause");
    Utils.checkMainThread();

    mBeaconManager.setBackgroundMode(true);
  }

  void onHostDestroy() {
    Log.d(TAG, "onHostPause");
    Utils.checkMainThread();

    mBeaconManager.removeRangeNotifier(this);
  }

  void startMonitoring(UUID uuid) {
    Log.d(TAG, "startMonitoring: " + uuid);
    Utils.checkMainThread();

    final Identifier identifier = Identifier.fromUuid(uuid);
    if (mRegions.containsKey(uuid)) {
      Log.d(TAG, "Already monitoring");
      return;
    }

    final Region region = new Region(uuid.toString(), identifier, null, null);
    mRegions.put(uuid, new RegionInfo(region, uuid));
    mBeaconBootstrap.addRegion(region);

    mBeaconManager.requestStateForRegion(region);
  }

  void stopMonitoring(UUID uuid) {
    Log.d(TAG, "stopMonitoring: " + uuid);
    Utils.checkMainThread();

    final Identifier identifier = Identifier.fromUuid(uuid);

    final RegionInfo regionInfo = mRegions.get(uuid);
    if (regionInfo == null) {
      Log.d(TAG, "Not monitoring");
      return;
    }

    mRegions.remove(uuid);

    final Region region = regionInfo.mRegion;

    if (regionInfo.mRanging) {
      try {
        mBeaconManager.stopRangingBeaconsInRegion(region);
      } catch (RemoteException e) {
        Log.d(TAG, "BeaconService not yet connected, ignoring");
      }
    }

    mBeaconBootstrap.removeRegion(region);
  }

  void reset() {
    Log.d(TAG, "reset");
    Utils.checkMainThread();

    final List<UUID> uuids = new ArrayList<>(mRegions.keySet());
    uuids.remove(CONFIG_BEACON_UUID);

    for (UUID uuid: uuids) {
      final RegionInfo regionInfo = mRegions.get(uuid);
      mRegions.remove(uuid);

      final Region region = regionInfo.mRegion;

      if (regionInfo.mRanging) {
        try {
          mBeaconManager.stopRangingBeaconsInRegion(region);
        } catch (RemoteException e) {
          Log.d(TAG, "BeaconService not yet connected, ignoring");
        }
      }

      mBeaconBootstrap.removeRegion(region);
    }
  }

  @Override
  public Context getApplicationContext() {
    return mSocketManager.reactContext();
  }

  @Override
  public void didDetermineStateForRegion(int state, Region region) {
    Log.d(TAG, "didDetermineStateForRegion: " + region + ", " + state);

    switch (state) {
      case MonitorNotifier.INSIDE:
        didEnterRegion(region);
        break;

      case MonitorNotifier.OUTSIDE:
        didExitRegion(region);
        break;

      default:
        Log.d(TAG, "Unhandled state " + state);
    }
  }

  @Override
  public void didEnterRegion(final Region region) {
    final UUID uuid = region.getId1().toUuid();

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        Utils.checkMainThread();

        final RegionInfo regionInfo = mRegions.get(uuid);
        if (regionInfo == null) {
          Log.d(TAG, "Not monitoring region: " + region);
          return;
        }

        if (regionInfo.mState != null &&
          regionInfo.mState == MonitorNotifier.INSIDE) {
          return;
        }

        Log.d(TAG, "didEnterRegion: " + region);
        regionInfo.mState = MonitorNotifier.INSIDE;

        if (!uuid.equals(CONFIG_BEACON_UUID)) {
          Utils.check(!regionInfo.mRanging);
          try {
            mBeaconManager.startRangingBeaconsInRegion(region);
            regionInfo.mRanging = true;
          } catch (RemoteException e) {
            Log.e(TAG, "Failed to start ranging: " + region + ", " + e);
          }
        }

        mSocketManager.regionEntered(uuid);
      }
    });
  }

  @Override
  public void didExitRegion(final Region region) {
    final UUID uuid = region.getId1().toUuid();

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        final RegionInfo regionInfo = mRegions.get(uuid);
        if (regionInfo == null) {
          Log.d(TAG, "Not monitoring region: " + region);
          return;
        }

        if (regionInfo.mState != null &&
          regionInfo.mState == MonitorNotifier.OUTSIDE) {
          return;
        }

        Log.d(TAG, "didExitRegion: " + region);
        regionInfo.mState = MonitorNotifier.OUTSIDE;

        if (regionInfo.mRanging) {
          try {
            mBeaconManager.stopRangingBeaconsInRegion(region);
            regionInfo.mRanging = false;
          } catch (RemoteException e) {
            Log.e(TAG, "Failed to stop ranging: " + region + ", " + e);
          }
        }

        mSocketManager.regionExited(uuid);
      }
    });
  }

  @Override
  public void didRangeBeaconsInRegion(Collection<Beacon> beacons,
                                      final Region region) {
    Log.d(TAG, "didRangeBeaconsInRegion: " + region + ", " + beacons.size());

    final UUID uuid = region.getId1().toUuid();
    Utils.check(!uuid.equals(CONFIG_BEACON_UUID));

    final Set<Integer> deviceNumbers = new HashSet<>(beacons.size());
    for (Beacon beacon: beacons) {
      deviceNumbers.add(beacon.getId3().toInt());
    }

    Utils.postToMainThread(new Runnable() {
      @Override
      public void run() {
        final RegionInfo regionInfo = mRegions.get(uuid);
        if (regionInfo == null) {
          Log.d(TAG, "Not monitoring this region");
          return;
        }

        if (!regionInfo.mRanging) {
          Log.d(TAG, "No longer ranging this region");
          return;
        }

        if (deviceNumbers.equals(regionInfo.mDeviceNumbersBeaconing)) {
          return;
        }

        regionInfo.mDeviceNumbersBeaconing = deviceNumbers;
        mSocketManager.regionBeacons(uuid, deviceNumbers);
      }
    });
  }
}
