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

  init(uuid: String) {
    self.region = CLBeaconRegion(proximityUUID: NSUUID(UUIDString:uuid), identifier: uuid)

    super.init()

    self.locationManager = CLLocationManager()
    if self.locationManager.respondsToSelector("requestAlwaysAuthorization") {
      self.locationManager.requestAlwaysAuthorization()
    }
    self.locationManager.delegate = self
    self.locationManager.pausesLocationUpdatesAutomatically = false

    // Request for auhthorization to access location
    if (CLLocationManager.authorizationStatus() != CLAuthorizationStatus.AuthorizedAlways) {
      NSLog("Not authorized to use, requesting permission");
      self.locationManager.requestAlwaysAuthorization()
    }
    self.locationManager.startMonitoringForRegion(self.region)
    self.locationManager.startUpdatingLocation()

    NSLog("init RegionMonitor \(self.region.identifier)");
  }

  func applicationDidBecomeActive() {
    self.locationManager.startRangingBeaconsInRegion(self.region)
  }

  func applicationWillResignActive() {
    self.locationManager.stopRangingBeaconsInRegion(self.region)
  }

  // When we launch this will read the current state of the region since we might have missed
  // the enter/exit notifications
  func locationManager(manager: CLLocationManager!, didRangeBeacons beacons: [AnyObject]!, inRegion region: CLBeaconRegion!) {
    if self.region.identifier == region.identifier && beacons.count > 0 {
      let nearestBeacon = beacons[0] as! CLBeacon
      if nearestBeacon.proximity != CLProximity.Unknown {
        self.delegate?.regionStateChanged(true)
      } else {
        self.delegate?.regionStateChanged(false)
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

