import Foundation
import CoreLocation
import CoreBluetooth

// This class sends a BLE service advertisement when in the home region
// and stops the advertisement when outside of the home region
class HomeBeacon: NSObject, CBPeripheralManagerDelegate {
  var peripheral : CBPeripheralManager!
  var enabled = false
  var advertising = false

  // This is a string that uniquely identifies the service being advertized
  // as part of BLE advertisement
  let serviceUuid = "699FEC30-6FCB-4ABE-A67E-591928AD01D0"

  override init() {
    super.init()

    let queue = dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)
    self.peripheral = CBPeripheralManager(delegate: self, queue: queue)
    self.peripheral.delegate = self
  }

  func updateState() {
    NSLog("updateState() peripheralState: \(self.peripheral.state.rawValue) enabled: \(self.enabled)")
    if self.enabled && !self.advertising && self.peripheral.state == .PoweredOn {
      // Note that in the background iBeacon is not allowed by iOS so
      // we are sending the BLE peripheral data instead
      NSLog("start advertising home beacon")
      let uuid = NSUUID(UUIDString: serviceUuid)
      let cbuuid = CBUUID(NSUUID: uuid)
      let dataToBeAdvertised:[String: AnyObject!] = [
        CBAdvertisementDataLocalNameKey: "Silk-app",
        CBAdvertisementDataServiceUUIDsKey: [cbuuid],
      ]
      self.peripheral!.startAdvertising(dataToBeAdvertised)
    } else if !self.enabled && self.advertising {
      NSLog("stop advertising  home beacon")
      self.peripheral.stopAdvertising()
      self.advertising = false;
    }
  }

  func peripheralManagerDidUpdateState(peripheral: CBPeripheralManager!){
    updateState()
  }

  func peripheralManagerDidStartAdvertising(peripheral: CBPeripheralManager!,
    error: NSError?) {
      if error == nil {
        self.advertising = true;
      } else {
        self.advertising = false;
        NSLog("peripheralManagerDgidStartAdvertising error:\(error?.localizedDescription)");
      }
  }

  func setIsEnabled(enabled: Bool) {
    if self.enabled != enabled {
      self.enabled = enabled
      updateState()
    }
  }
}

