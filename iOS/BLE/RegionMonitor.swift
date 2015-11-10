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
    var sentFirstNotification: Bool = false
    
    init(uuid: NSUUID, region: CLBeaconRegion) {
      self.uuid = uuid
      self.region = region
    }
  }

  private var locationManager: CLLocationManager!
  private var regions: [String: RegionInfo] = [:]

  var delegate: RegionMonitorDelegate?

  override init() {
    log.debug("RegionMonitor()")

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
    
    super.init()

    assert(RegionMonitor.instance === nil,
           "RegionMonitor can't handle more than one instance!")
    RegionMonitor.instance = self

    // Request for auhthorization to access location
    if (CLLocationManager.authorizationStatus() != .AuthorizedAlways) {
      log.info("Not authorized to use location, requesting permission")
      self.locationManager.requestAlwaysAuthorization()
    }
    self.locationManager.delegate = self

    for (_, regionInfo) in self.regions {
      let region = regionInfo.region

      log.info("Started monitoring region \(region)")
      self.locationManager.startMonitoringForRegion(region)

      // Make sure we always get at least one notification, regardless of
      // whether we are currently in the region or not.
      self.locationManager.requestStateForRegion(region)
    }

    BLESocketManager.setRegionMonitor(self)
  }

  var regionUuids: [NSUUID] {
    get {
      var uuids: [NSUUID] = []

      for (_, regionInfo) in self.regions {
        uuids.append(regionInfo.uuid)
      }
      
      return uuids
    }
  }

  func startMonitoring(beaconUuid: NSUUID) {
    log.debug("startMonitoring('\(beaconUuid)')")

    let identifier = beaconUuid.UUIDString
    if self.regions[identifier] != nil {
      log.info("Already monitoring this region, ignoring")
      return
    }

    let region =
      CLBeaconRegion(proximityUUID: beaconUuid, identifier: identifier)
    self.regions[identifier] = RegionInfo(uuid: beaconUuid, region: region)

    log.info("Started monitoring region \(region)")
    self.locationManager.startMonitoringForRegion(region)

    self.locationManager.requestStateForRegion(region)

    let userDefaults = NSUserDefaults.standardUserDefaults()

    var savedUuids = userDefaults.arrayForKey(RegionMonitor.beaconUuidsKey)
    if savedUuids == nil {
      savedUuids = [ identifier ]
    } else {
      assert(!savedUuids!.isEmpty)
      savedUuids!.append(identifier)
    }
    userDefaults.setObject(savedUuids, forKey: RegionMonitor.beaconUuidsKey)
    
    self.delegate?.regionAdded(self, uuid: beaconUuid)
  }

  func stopMonitoring(beaconUuid: NSUUID) {
    log.debug("stopMonitoring('\(beaconUuid)')")

    assert(beaconUuid != RegionMonitor.configBeaconUuid)

    let identifier = beaconUuid.UUIDString
    if self.regions[identifier] == nil {
      log.info("Not monitoring this region, ignoring")
      return
    }

    let regionInfo = self.regions[identifier]!
    self.regions[identifier] = nil

    log.info("Stopped monitoring region \(regionInfo.region)")
    self.locationManager.stopMonitoringForRegion(regionInfo.region)

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

    self.delegate?.regionRemoved(self, uuid: beaconUuid)
  }

  func reset() {
    log.debug("reset()")

    var removedUuids: [NSUUID] = []

    let identifiers = Array(self.regions.keys)
    for identifier in identifiers {
      let regionInfo = self.regions[identifier]!

      if regionInfo.uuid != RegionMonitor.configBeaconUuid {
        log.info("Stopped monitoring region \(regionInfo.region)")
        self.locationManager.stopMonitoringForRegion(regionInfo.region)

        self.regions[identifier] = nil
        removedUuids.append(regionInfo.uuid)
      }
    }

    if !removedUuids.isEmpty {
      let userDefaults = NSUserDefaults.standardUserDefaults()
      userDefaults.removeObjectForKey(RegionMonitor.beaconUuidsKey)

      if let delegate = self.delegate {
        for uuid in removedUuids {
          delegate.regionRemoved(self, uuid: uuid)
        }
      }
    }
  }

  func locationManager(manager: CLLocationManager,
                       monitoringDidFailForRegion region: CLRegion?,
                       withError error: NSError) {
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
    assert(manager === self.locationManager)
    if let regionInfo = self.regions[region.identifier] {
      log.info("didDetermineState(\(state.rawValue), \(region))")
      regionInfo.state = state

      if !regionInfo.sentFirstNotification {
        if state == .Inside {
          regionInfo.sentFirstNotification = true
          self.delegate?.regionEntered(self, uuid: regionInfo.uuid)
        } else if state == .Outside {
          regionInfo.sentFirstNotification = true
          self.delegate?.regionExited(self, uuid: regionInfo.uuid)
        }
      }
    }
  }

  // Entering the region is immediate and re-launches the app if we aren't
  // currently running
  func locationManager(manager: CLLocationManager,
                       didEnterRegion region: CLRegion) {

    assert(manager === self.locationManager)
    if let regionInfo = self.regions[region.identifier] {
      log.info("didEnterRegion(\(region)")
      if regionInfo.state != .Inside {
        regionInfo.state = .Inside
        regionInfo.sentFirstNotification = true
        self.delegate?.regionEntered(self, uuid: regionInfo.uuid)
      }
    }
  }

  // Leaving the region occurs after a timeout when the last beacon in the
  // region goes out of range
  func locationManager(manager: CLLocationManager,
                       didExitRegion region: CLRegion) {
    assert(manager === self.locationManager)
    if let regionInfo = self.regions[region.identifier] {
      log.info("didExitRegion(\(region)")
      if regionInfo.state != .Outside {
        regionInfo.state = .Outside
        regionInfo.sentFirstNotification = true
        self.delegate?.regionExited(self, uuid: regionInfo.uuid)
      }
    }
  }
}

