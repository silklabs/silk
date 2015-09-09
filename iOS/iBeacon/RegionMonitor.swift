import CoreLocation

protocol RegionUpdatesDelegate {
  func regionStateChanged(entered: Bool);
}

// This class monitors enter/exit from our home region and report state back via
// RegionUpdatesDelegate
class RegionMonitor: NSObject, CLLocationManagerDelegate {

  var locationManager: CLLocationManager!
  var region: CLBeaconRegion
  var delegate: RegionUpdatesDelegate?
  var initialUpdate: Bool

  init(uuid: String) {
    self.region = CLBeaconRegion(proximityUUID: NSUUID(UUIDString:uuid), identifier: uuid)
    self.initialUpdate = false
    
    super.init()

    self.locationManager = CLLocationManager()
    // Request for auhthorization to access location
    if (CLLocationManager.authorizationStatus() != CLAuthorizationStatus.AuthorizedAlways) {
      NSLog("Not authorized to use, requesting permission");
      self.locationManager.requestAlwaysAuthorization()
    }
    self.locationManager.delegate = self
    self.locationManager.pausesLocationUpdatesAutomatically = false

    self.locationManager.startMonitoringForRegion(self.region)

    // Make sure we always get at least one notification, regardless of whether we are currently
    // in the region or not.
    self.initialUpdate = true
    self.locationManager.requestStateForRegion(self.region)

    NSLog("init RegionMonitor \(self.region.identifier)");
  }

  // When we launch this will read the current state of the region since we might have missed
  // the enter/exit notifications
  func locationManager(manager: CLLocationManager!, didDetermineState state: CLRegionState, forRegion region: CLRegion!) {
    if self.initialUpdate {
      NSLog("didDetermineState \(region.identifier) \(state.rawValue)")
      if self.region.identifier == region.identifier {
        if state != .Unknown {
          self.initialUpdate = false
          self.delegate?.regionStateChanged(state == .Inside)
        }
      }
    }
  }

  // Entering the region is immediate and re-launches the app if we aren't currently running
  func locationManager(manager: CLLocationManager!, didEnterRegion region: CLRegion!) {
    NSLog("didEnterRegion \(region.identifier)")
    if self.region.identifier == region.identifier {
      self.delegate?.regionStateChanged(true)
    }
  }

  // Leaving the region occurs after a timeout when the last beacon in the region goes out of
  // range
  func locationManager(manager: CLLocationManager!, didExitRegion region: CLRegion!) {
    NSLog("didExitRegion \(region.identifier)")
    if self.region.identifier == region.identifier {
      self.delegate?.regionStateChanged(false)
    }
  }
}

