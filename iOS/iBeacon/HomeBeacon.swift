import Foundation
import CoreLocation
import CoreBluetooth

// This class sends a BLE service advertisement when in the home region
// and stops the advertisement when outside of the home region.
class HomeBeacon: NSObject, CBPeripheralManagerDelegate {
  // This will be the 'local name' for the device when advertising.
  let deviceName = "Silk-app"

  // This is a string that uniquely identifies the service being advertized
  // as part of BLE advertisement.
  let serviceUuid =
    CBUUID(string: "699fec30-6fcb-4abe-a67e-591928ad01d0")

  var queue: dispatch_queue_t!
  var peripheral: CBPeripheralManager!
  var service: CBMutableService!
  var enabled: Bool = false
  var advertising: Bool = false

  override init() {
    super.init()

    self.queue = dispatch_queue_create("com.silklabs.HomeBeacon", nil)
    self.peripheral = CBPeripheralManager(delegate:self, queue:self.queue)
    self.peripheral.delegate = self

    self.service = CBMutableService(type:serviceUuid, primary:true)
  }

  func startAdvertising() {
    NSLog("Start advertising")

    assert(!self.advertising, "Already advertising")

    // Note that in the background iBeacon is not allowed by iOS so we are
    // advertising a service instead

    self.peripheral.addService(self.service)

    let dataToBeAdvertised:[String: AnyObject!] = [
      CBAdvertisementDataLocalNameKey:deviceName,
      CBAdvertisementDataServiceUUIDsKey:[ serviceUuid ],
    ]
    self.peripheral.startAdvertising(dataToBeAdvertised)
    self.advertising = true
  }

  func stopAdvertising() {
    NSLog("Stop advertising")

    assert(self.advertising, "Not advertising")

    self.peripheral.stopAdvertising()
    self.advertising = false

    self.peripheral.removeService(self.service)
  }

  func updateState() {
    NSLog("updateState() " +
          "peripheralState: \(self.peripheral.state.rawValue) " +
          "enabled: \(self.enabled) " +
          "advertising: \(self.advertising) " +
          "state: \(self.peripheral.state.rawValue)")
    if self.enabled &&
       !self.advertising &&
       self.peripheral.state == .PoweredOn {
      startAdvertising()
    } else if self.advertising &&
              (!self.enabled || self.peripheral.state != .PoweredOn) {
      stopAdvertising()
    }
  }

  func setIsEnabled(enabled: Bool) {
    dispatch_async(self.queue) {
      self.enabled = enabled
      self.updateState()
    }
  }

  func peripheralManagerDidUpdateState(peripheral: CBPeripheralManager){
    NSLog("State changed: \(peripheral.state.rawValue)")
    updateState()
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         didAddService service: CBService,
                         error: NSError?) {
    if error == nil {
      NSLog("Added service")
    } else {
      NSLog("Failed to add service: \(error?.localizedDescription)")
    }
  }

  func peripheralManagerDidStartAdvertising(peripheral: CBPeripheralManager,
                                            error: NSError?) {
    if error == nil {
      NSLog("Started advertising")
    } else {
      NSLog("Failed to start advertising: \(error?.localizedDescription)")
      self.advertising = false
    }
  }
}

