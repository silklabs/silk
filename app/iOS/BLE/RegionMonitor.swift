import CoreLocation

protocol RegionMonitorDelegate {
  func regionAdded(regionMonitor: RegionMonitor, uuid: NSUUID)
  func regionRemoved(regionMonitor: RegionMonitor, uuid: NSUUID)
  func regionEntered(regionMonitor: RegionMonitor, uuid: NSUUID)
  func regionExited(regionMonitor: RegionMonitor, uuid: NSUUID)
}

private let log = DebugLog.create("silk-RegionMonitor")

// This class monitors enter/exit from our home region and report state back via
// RegionUpdatesDelegate
internal class RegionMonitor: NSObject, CLLocationManagerDelegate {

  private static let beaconUuidsKey = "silk-regionmonitor-beacon-uuids"
  internal static let configBeaconUuid =
    NSUUID(UUIDString: "e0f3a744-fb2f-46f1-b45a-f2b398f2a424")!

  private static var instance: RegionMonitor? = nil

  private class RegionInfo {
    let uuid: NSUUID
    let region: CLBeaconRegion
    var state: CLRegionState = .Unknown

    init(uuid: NSUUID, region: CLBeaconRegion) {
      self.uuid = uuid
      self.region = region
    }
  }

  private let locationManager: CLLocationManager?
  private var monitoringEnabled: Bool = false
  private var regions: [String: RegionInfo] = [:]
  private var monitoring: Bool = false

  let delegate: RegionMonitorDelegate

  init(delegate: RegionMonitorDelegate) {
    log.debug("RegionMonitor()")

    assert(RegionMonitor.instance === nil,
           "RegionMonitor can't handle more than one instance!")

    self.delegate = delegate

    if CLLocationManager.isMonitoringAvailableForClass(CLBeaconRegion) {
      self.locationManager = CLLocationManager()

      var beaconUuids: [NSUUID] = [RegionMonitor.configBeaconUuid]

      let userDefaults = NSUserDefaults.standardUserDefaults()
      if let savedUuids = userDefaults.arrayForKey(RegionMonitor.beaconUuidsKey) {
        assert(!savedUuids.isEmpty)
        log.info("Retrieved saved beacon uuids: \(savedUuids)")
        for entry in savedUuids {
          let uuidString = entry as! String
          let uuid = NSUUID(UUIDString: uuidString)!
          assert(uuid != RegionMonitor.configBeaconUuid)
          beaconUuids.append(uuid)
        }
      } else {
        log.info("No additional beacon uuids saved")
      }

      for beaconUuid in beaconUuids {
        let identifier = beaconUuid.UUIDString
        let region =
          CLBeaconRegion(proximityUUID: beaconUuid, identifier: identifier)
        self.regions[identifier] = RegionInfo(uuid: beaconUuid, region: region)
      }
    } else {
      log.error("Device does not support monitoring iBeacons");
      self.locationManager = nil
    }

    super.init()

    RegionMonitor.instance = self
    BLESocketManager.setRegionMonitor(self)

    if let locationManager = self.locationManager {
      locationManager.delegate = self

      let locationAuthorization = CLLocationManager.authorizationStatus()
      log.debug("Authorization status: \(locationAuthorization.rawValue)")

      if locationAuthorization == .Restricted ||
         locationAuthorization == .Denied {
        log.error("Not allowed to use location services")
      } else if locationAuthorization != .AuthorizedAlways {
        log.info("Requesting 'always' location permission")
        locationManager.requestAlwaysAuthorization()
      }
    }
  }

  private func startMonitoringAllRegions() {
    log.debug("startMonitoringAllRegions()")

    assert(self.locationManager != nil)
    assert(self.monitoringEnabled)
    assert(!self.monitoring)
    assert(CLLocationManager.authorizationStatus() == .AuthorizedAlways)

    self.monitoring = true

    let locationManager = self.locationManager!

    for (identifier, regionInfo) in self.regions {
      log.info("Starting to monitor region '\(identifier)'")

      locationManager.startMonitoringForRegion(regionInfo.region)

      // Make sure we always get at least one notification, regardless of
      // whether we are currently in the region or not.
      locationManager.requestStateForRegion(regionInfo.region)

      self.delegate.regionAdded(self, uuid: regionInfo.uuid)
    }
  }

  func start() {
    log.debug("start()")

    if self.locationManager == nil {
      return;
    }

    assert(!self.monitoringEnabled)
    self.monitoringEnabled = true

    if CLLocationManager.authorizationStatus() == .AuthorizedAlways {
      self.startMonitoringAllRegions()
    } else {
      log.debug("Waiting for authorization to use location services")
    }
  }

  func startMonitoring(beaconUuid: NSUUID) {
    log.debug("startMonitoring('\(beaconUuid)')")

    assert(beaconUuid != RegionMonitor.configBeaconUuid)

    if self.locationManager == nil {
      return;
    }

    let identifier = beaconUuid.UUIDString
    if self.regions[identifier] != nil {
      log.info("Already monitoring this region, ignoring")
      return
    }

    let region =
      CLBeaconRegion(proximityUUID: beaconUuid, identifier: identifier)
    self.regions[identifier] = RegionInfo(uuid: beaconUuid, region: region)

    let userDefaults = NSUserDefaults.standardUserDefaults()

    var savedUuids = userDefaults.arrayForKey(RegionMonitor.beaconUuidsKey)
    if savedUuids == nil {
      savedUuids = [ identifier ]
    } else {
      assert(!savedUuids!.isEmpty)
      savedUuids!.append(identifier)
    }
    userDefaults.setObject(savedUuids, forKey: RegionMonitor.beaconUuidsKey)

    if self.monitoring {
      log.info("Starting to monitor region '\(identifier)'")
      self.locationManager!.startMonitoringForRegion(region)
      self.locationManager!.requestStateForRegion(region)

      self.delegate.regionAdded(self, uuid: beaconUuid)
    }
  }

  func stopMonitoring(beaconUuid: NSUUID) {
    log.debug("stopMonitoring('\(beaconUuid)')")

    assert(beaconUuid != RegionMonitor.configBeaconUuid)

    if self.locationManager == nil {
      return;
    }

    let identifier = beaconUuid.UUIDString
    if self.regions[identifier] == nil {
      log.info("Not monitoring this region, ignoring")
      return
    }

    let regionInfo = self.regions[identifier]!
    self.regions[identifier] = nil

    let userDefaults = NSUserDefaults.standardUserDefaults()

    var savedUuids = userDefaults.arrayForKey(RegionMonitor.beaconUuidsKey)!
    assert(!savedUuids.isEmpty)
    if savedUuids.count == 1 {
      userDefaults.removeObjectForKey(RegionMonitor.beaconUuidsKey)
    } else {
      var removed = false
      for (index, savedUuid) in savedUuids.enumerate() {
        if identifier == savedUuid as! String {
          savedUuids.removeAtIndex(index)
          removed = true
          break
        }
      }
      assert(removed)
      userDefaults.setObject(savedUuids, forKey: RegionMonitor.beaconUuidsKey)
    }

    if self.monitoring {
      log.info("Stopped monitoring region '\(identifier)'")
      self.locationManager!.stopMonitoringForRegion(regionInfo.region)

      self.delegate.regionRemoved(self, uuid: beaconUuid)
    }
  }

  func reset() {
    log.debug("reset()")

    if self.locationManager == nil {
      return;
    }

    let locationManager = self.locationManager!

    var removedUuids: [NSUUID] = []

    let identifiers = Array(self.regions.keys)
    for identifier in identifiers {
      let regionInfo = self.regions[identifier]!

      if regionInfo.uuid != RegionMonitor.configBeaconUuid {
        if self.monitoring {
          log.info("Stopped monitoring region '\(identifier)'")
          locationManager.stopMonitoringForRegion(regionInfo.region)
        }

        self.regions[identifier] = nil
        removedUuids.append(regionInfo.uuid)
      }
    }

    if !removedUuids.isEmpty {
      let userDefaults = NSUserDefaults.standardUserDefaults()
      userDefaults.removeObjectForKey(RegionMonitor.beaconUuidsKey)

      if self.monitoring {
        for uuid in removedUuids {
          self.delegate.regionRemoved(self, uuid: uuid)
        }
      }
    }
  }

  func locationManager(manager: CLLocationManager,
                       didChangeAuthorizationStatus status: CLAuthorizationStatus) {
    assert(manager === self.locationManager!)
    if status == .AuthorizedAlways {
      log.debug("User granted 'always' location permission")
      if !self.monitoring {
        self.startMonitoringAllRegions()
      }
    } else {
      log.info("Authorization status changed to \(status.rawValue)")
    }
  }

  func locationManager(manager: CLLocationManager,
                       monitoringDidFailForRegion region: CLRegion?,
                       withError error: NSError) {
    assert(manager === self.locationManager!)
    if region == nil {
      log.error("Failed to monitor region: \(error)")
    } else {
      log.error("Failed to monitor region \(region!): \(error)")
    }
  }

  // When we launch this will read the current state of the region since we
  // might have missed the enter/exit notifications
  func locationManager(manager: CLLocationManager,
                       didDetermineState state: CLRegionState,
                       forRegion region: CLRegion) {
    assert(manager === self.locationManager!)
    assert(self.monitoring)
    if let regionInfo = self.regions[region.identifier] {
      log.info("didDetermineState(\(state.rawValue), \(region.identifier))")

      // Assume unknown means outside.
      let stateToReport = state == .Unknown ? .Outside : state

      if regionInfo.state != stateToReport {
        regionInfo.state = stateToReport

        if stateToReport == .Inside {
          self.delegate.regionEntered(self, uuid: regionInfo.uuid)
        } else {
          self.delegate.regionExited(self, uuid: regionInfo.uuid)
        }
      }
    }
  }

  // Entering the region is immediate and re-launches the app if we aren't
  // currently running
  func locationManager(manager: CLLocationManager,
                       didEnterRegion region: CLRegion) {
    assert(manager === self.locationManager!)
    assert(self.monitoring)
    if let regionInfo = self.regions[region.identifier] {
      log.info("didEnterRegion(\(region.identifier)")
      if regionInfo.state != .Inside {
        regionInfo.state = .Inside
        self.delegate.regionEntered(self, uuid: regionInfo.uuid)
      }
    }
  }

  // Leaving the region occurs after a timeout when the last beacon in the
  // region goes out of range
  func locationManager(manager: CLLocationManager,
                       didExitRegion region: CLRegion) {
    assert(manager === self.locationManager!)
    assert(self.monitoring)
    if let regionInfo = self.regions[region.identifier] {
      log.info("didExitRegion(\(region.identifier)")
      if regionInfo.state != .Outside {
        regionInfo.state = .Outside
        self.delegate.regionExited(self, uuid: regionInfo.uuid)
      }
    }
  }
}

