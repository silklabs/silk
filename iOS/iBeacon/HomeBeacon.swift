import Foundation
import CoreLocation
import CoreBluetooth

private let log = DebugLog.create("silk-beacon")

// This class sends a BLE service advertisement when in the home region
// and stops the advertisement when outside of the home region.
class HomeBeacon: NSObject, CBPeripheralManagerDelegate {
  private static var instance: HomeBeacon!

  // This will be the 'local name' for the device when advertising.
  let deviceName = "Silk-app"

  // TODO: Make this unique per account.
  let serviceUuid =
    CBUUID(string: "2d1b42ac-40cc-4ff2-a97d-b67027bc89f9")

  // This characteristic is used for outgoing data.
  let indicateCharacteristicUuid =
    CBUUID(string: "59ba85fb-6fba-439c-95b0-9307e62d4ca1")
  private let indicateCharacteristicProperties =
    CBCharacteristicProperties.Indicate
  private let indicateCharacteristicPermissions =
    CBAttributePermissions(rawValue: 0)

  // This characteristic is used for incoming data.
  let writeCharacteristicUuid =
    CBUUID(string: "f08ea3c8-e858-4b30-8b86-f2d39690acc1")
  private let writeCharacteristicProperties =
    CBCharacteristicProperties.Write
  private let writeCharacteristicPermissions =
    CBAttributePermissions.Writeable

  private var queue: dispatch_queue_t
  private let service: CBMutableService
  private let indicateCharacteristic: CBMutableCharacteristic
  private let writeCharacteristic: CBMutableCharacteristic
  private var peripheral: CBPeripheralManager
  private var socketManager: BLESocketManager

  private var enabled: Bool = false
  private var advertising: Bool = false

  // This class holds outgoing data until it can be sent.
  private class Connection : Hashable {
    let id: Int
    let central: CBCentral
    var outgoingQueue = [NSData]()

    var hashValue: Int {
      return unsafeAddressOf(self).hashValue;
    }

    init(id: Int, central: CBCentral) {
      self.id = id
      self.central = central
    }
  }

  private var connectionsById = [Int: Connection]()
  private var connectionsByCentral = [CBCentral: Connection]()
  private var pendingWrites = [Connection]()
  private var nextConnectionId = 0

  override init() {
    log.debug("HomeBeacon()")

    self.indicateCharacteristic =
      CBMutableCharacteristic(type: indicateCharacteristicUuid,
                              properties: indicateCharacteristicProperties,
                              value: nil,
                              permissions: indicateCharacteristicPermissions)
    self.writeCharacteristic =
      CBMutableCharacteristic(type: writeCharacteristicUuid,
                              properties: writeCharacteristicProperties,
                              value: nil,
                              permissions: writeCharacteristicPermissions)

    self.service = CBMutableService(type: serviceUuid, primary: true)
    self.service.characteristics = [
      self.indicateCharacteristic,
      self.writeCharacteristic,
    ]

    self.socketManager = BLESocketManager.getOrCreateInstance()
    self.queue = self.socketManager.methodQueue

    self.peripheral = CBPeripheralManager(delegate: nil, queue: self.queue)

    super.init()

    BLESocketManager.setBeacon(self)

    assert(HomeBeacon.instance == nil,
           "BLESocketManager can't handle more than one instance!")
    HomeBeacon.instance = self

    self.peripheral.delegate = self
  }

  func updateSocketManager(socketManager: BLESocketManager!) {
    self.socketManager = socketManager
  }

  func startAdvertising() {
    log.debug("HomeBeacon.startAdvertising()")

    assert(!self.advertising, "Already advertising")

    self.peripheral.addService(self.service)

    let dataToBeAdvertised:[String: AnyObject!] = [
      CBAdvertisementDataLocalNameKey:deviceName,
      CBAdvertisementDataServiceUUIDsKey:[ serviceUuid ],
    ]
    self.peripheral.startAdvertising(dataToBeAdvertised)
    self.advertising = true
  }

  func stopAdvertising() {
    log.debug("HomeBeacon.stopAdvertising()")

    assert(self.advertising, "Not advertising")

    self.peripheral.stopAdvertising()
    self.advertising = false

    self.peripheral.removeService(self.service)
  }

  func setIsEnabled(enabled: Bool) {
    dispatch_async(self.queue) {
      self.enabled = enabled
      self.updateState()
    }
  }

  func send(id: Int, data: NSData!) {
    if let connection = self.connectionsById[id] {
      connection.outgoingQueue.append(data)
      self.pendingWrites.append(connection)
      self.sendOutgoingData()
    } else {
      log.error("Invalid connection id \(id), ignoring")
    }
  }

  private func updateState() {
    log.debug("updateState() " +
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

  private func sendConnectionOutgoingData(connection: Connection!) -> Bool {
    assert(!self.pendingWrites.isEmpty)
    assert(self.pendingWrites[0] === connection)

    var returnValue = false
    let maxLength = connection.central.maximumUpdateValueLength

    // Send as much data as we can.
    while true {
      var outgoing = connection.outgoingQueue

      // Build up a chunk of data to send based on the max size that can be sent
      // to the central.
      let chunk: NSMutableData! = NSMutableData(capacity: maxLength)

      var index = 0;
      for ; index < outgoing.count; index++ {
        let data = outgoing[index]

        let dataLength = data.length
        let availableLength = maxLength - chunk.length

        // If we can't fit all the data then slice it up for the next chunk.
        if dataLength > availableLength {
          let chunkRange = NSRange(location: 0, length: availableLength)
          let remainingRange = NSRange(location: availableLength,
                                       length: dataLength - availableLength)
          chunk.appendData(data.subdataWithRange(chunkRange))
          outgoing[index] = data.subdataWithRange(remainingRange)
          break
        }

        chunk.appendData(data)
      }

      // Pull any completely consumed data out of the array.
      if index != 0 {
        outgoing.removeFirst(index)
      }

      let success =
        self.peripheral.updateValue(chunk,
                                    forCharacteristic: self.indicateCharacteristic,
                                    onSubscribedCentrals: [connection.central])

      // Only update |connection.outgoingQueue| if that succeeded. Otherwise we
      // will try again in the |peripheralManagerIsReadyToUpdateSubscribers|
      // callback.
      if success {
        connection.outgoingQueue = outgoing
        returnValue = true
      } else {
        self.pendingWrites.append(connection)
        break
      }
    }

    return returnValue
  }

  private func sendOutgoingData() {
    while !self.pendingWrites.isEmpty {
      let connection = self.pendingWrites[0]
      if connection.outgoingQueue.isEmpty ||
         self.sendConnectionOutgoingData(connection) {
        self.pendingWrites.removeFirst()
      } else {
        break
      }
    }
  }

  func peripheralManagerDidUpdateState(peripheral: CBPeripheralManager) {
    assert(peripheral == self.peripheral)

    log.info("State changed: \(peripheral.state.rawValue)")

    updateState()
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         didAddService service: CBService,
                         error: NSError?) {
    assert(peripheral == self.peripheral)

    if error == nil {
      log.debug("Added service")
    } else {
      log.error("Failed to add service: \(error?.localizedDescription)")
    }
  }

  func peripheralManagerDidStartAdvertising(peripheral: CBPeripheralManager,
                                            error: NSError?) {
    assert(peripheral == self.peripheral)

    if error == nil {
      log.debug("Started advertising")
    } else {
      log.error("Failed to start advertising: \(error?.localizedDescription)")
      self.advertising = false
    }
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         didReceiveReadRequest request: CBATTRequest) {
    assert(peripheral == self.peripheral)

    log.info("Received unsupported read request for uuid: " +
             "\(request.characteristic.UUID)");

    var error: CBATTError
    if request.characteristic.UUID == indicateCharacteristicUuid ||
       request.characteristic.UUID == writeCharacteristicUuid {
      error = .ReadNotPermitted
    } else {
      error = .RequestNotSupported
    }

    peripheral.respondToRequest(request, withResult: error)
  }
  
  func peripheralManager(peripheral: CBPeripheralManager,
                         didReceiveWriteRequests requests: [CBATTRequest]) {
    assert(peripheral == self.peripheral)

    // If any request fails then we are supposed to pretend like all of them
    // failed, so modifications to our data are held on the stack until we know
    // that all requests succeeded.
    var pendingData = [Connection: NSMutableData]()

    for request in requests {
      if request.characteristic.UUID == indicateCharacteristicUuid {
        peripheral.respondToRequest(request,
                                    withResult:CBATTError.WriteNotPermitted)
        return
      }

      if request.characteristic.UUID != writeCharacteristicUuid {
        peripheral.respondToRequest(request,
                                    withResult:CBATTError.RequestNotSupported)
        return
      }

      // TODO: Handle this?
      if request.offset != 0 {
        peripheral.respondToRequest(request,
                                    withResult:CBATTError.InvalidOffset)
        return
      }

      if let connection = self.connectionsByCentral[request.central] {
        let data = pendingData[connection]
        if data == nil {
          pendingData[connection] = NSMutableData(data: request.value!)
        } else {
          data!.appendData(request.value!)
        }
      } else {
        peripheral.respondToRequest(request,
                                    withResult:CBATTError.RequestNotSupported)
        return
      }
    }

    // All requests succeeded, update our data structures.
    for (connection, data) in pendingData {
      self.socketManager.receive(connection.id, data: data)
    }

    // Tell CoreBluetooth that everything is ok.
    peripheral.respondToRequest(requests[0], withResult: CBATTError.Success)
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         central: CBCentral,
                         didSubscribeToCharacteristic characteristic: CBCharacteristic) {
    assert(peripheral == self.peripheral)

    if characteristic.UUID == indicateCharacteristicUuid {

      if let _ = self.connectionsByCentral[central] {
        log.error("Central attempted to subscribe more than once!");
      } else {
        let id = self.nextConnectionId++
        let connection = Connection(id: id, central: central)
        self.connectionsById[id] = connection
        self.connectionsByCentral[central] = connection
        self.socketManager.connect(id)
      }
    } else {
      log.debug("Subscribed to characteristic: \(characteristic.UUID)");
    }
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         central: CBCentral,
                         didUnsubscribeFromCharacteristic characteristic: CBCharacteristic) {
    assert(peripheral == self.peripheral)

    if characteristic.UUID == indicateCharacteristicUuid {
      if let connection = self.connectionsByCentral[central] {
        self.connectionsById[connection.id] = nil
        self.connectionsByCentral[central] = nil
        for var index = 0; index < self.pendingWrites.count; {
          if self.pendingWrites[index] === central {
            self.pendingWrites.removeAtIndex(index)
          } else {
            index++
          }
        }
        self.socketManager.disconnect(connection.id)
      }
    } else {
      log.debug("Unsubscribed from characteristic: \(characteristic.UUID)");
    }
  }

  func peripheralManagerIsReadyToUpdateSubscribers(peripheral: CBPeripheralManager) {
    assert(peripheral == self.peripheral)

    self.sendOutgoingData()
  }
}

private func ==(lhs: HomeBeacon.Connection, rhs: HomeBeacon.Connection) -> Bool {
  return lhs === rhs;
}
