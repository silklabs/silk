import Foundation
import CoreLocation
import CoreBluetooth

private let log = DebugLog.create("silk-beacon")

// This class sends a BLE service advertisement when in the home region
// and stops the advertisement when outside of the home region.
class HomeBeacon: NSObject,
                  CBCentralManagerDelegate,
                  CBPeripheralManagerDelegate,
                  CBPeripheralDelegate {
  private static var instance: HomeBeacon!

  // This will be the 'local name' for the device when advertising.
  let deviceName = "Silk-app"

  let configServiceUuid =
    CBUUID(string: "e0f3a744-fb2f-46f1-b45a-f2b398f2a424")

  // This characteristic is used for sending and receiving data.
  let characteristicUuid =
    CBUUID(string: "59ba85fb-6fba-439c-95b0-9307e62d4ca1")
  private let characteristicProperties: CBCharacteristicProperties = [
    .Indicate,
    .Write
  ]
  private let characteristicPermissions =
    CBAttributePermissions.Writeable

  private var queue: dispatch_queue_t
  private let service: CBMutableService
  private let characteristic: CBMutableCharacteristic
  private var peripheralManager: CBPeripheralManager
  private var centralManager: CBCentralManager
  private var socketManager: BLESocketManager

  private var enabled: Bool = false
  private var advertising: Bool = false

  // This class holds outgoing data until it can be sent.
  private class Connection : Hashable {
    let id: Int
    let central: CBCentral
    let peripheral: CBPeripheral
    var rssiUpdatePending: Bool = false
    var outgoingQueue = [NSData]()

    var hashValue: Int {
      return unsafeAddressOf(self).hashValue;
    }

    init(id: Int, central: CBCentral, peripheral: CBPeripheral) {
      self.id = id
      self.central = central
      self.peripheral = peripheral
    }
  }

  private var connectionsById = [Int: Connection]()
  private var connectionsByCentral = [CBCentral: Connection]()
  private var connectionsByPeripheral = [CBPeripheral: Connection]()
  private var pendingWrites = [Connection]()
  private var nextConnectionId = 0

  override init() {
    log.debug("HomeBeacon()")

    self.characteristic =
      CBMutableCharacteristic(type: characteristicUuid,
                              properties: characteristicProperties,
                              value: nil,
                              permissions: characteristicPermissions)

    self.service = CBMutableService(type: configServiceUuid, primary: true)
    self.service.characteristics = [ self.characteristic ]

    self.socketManager = BLESocketManager.getOrCreateInstance()
    self.queue = self.socketManager.methodQueue

    self.peripheralManager =
      CBPeripheralManager(delegate: nil, queue: self.queue)
    self.centralManager = CBCentralManager(delegate: nil, queue: self.queue)

    super.init()

    BLESocketManager.setBeacon(self)

    assert(HomeBeacon.instance == nil,
           "BLESocketManager can't handle more than one instance!")
    HomeBeacon.instance = self

    self.peripheralManager.delegate = self
    self.centralManager.delegate = self
  }

  func updateSocketManager(socketManager: BLESocketManager!) {
    self.socketManager = socketManager
  }

  func startAdvertising() {
    log.debug("HomeBeacon.startAdvertising()")

    assert(!self.advertising, "Already advertising")

    self.peripheralManager.addService(self.service)

    let dataToBeAdvertised:[String: AnyObject!] = [
      CBAdvertisementDataLocalNameKey:deviceName,
      CBAdvertisementDataServiceUUIDsKey:[ configServiceUuid ],
    ]
    self.peripheralManager.startAdvertising(dataToBeAdvertised)
    self.advertising = true
  }

  func stopAdvertising() {
    log.debug("HomeBeacon.stopAdvertising()")

    assert(self.advertising, "Not advertising")

    self.peripheralManager.stopAdvertising()
    self.advertising = false

    self.peripheralManager.removeService(self.service)
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

  func updateRssi(id: Int) {
    if let connection = self.connectionsById[id] {
      if connection.peripheral.delegate == nil {
        log.info("Peripheral not yet connected, queueing rssi update")
        connection.rssiUpdatePending = true
      }
      connection.peripheral.readRSSI()
    } else {
      log.error("Invalid connection id \(id), ignoring")
    }
  }

  private func updateState() {
    log.debug("updateState() " +
              "peripheralState: \(self.peripheralManager.state.rawValue) " +
              "enabled: \(self.enabled) " +
              "advertising: \(self.advertising) " +
              "state: \(self.peripheralManager.state.rawValue)")

    if self.enabled &&
       !self.advertising &&
       self.peripheralManager.state == .PoweredOn {
      startAdvertising()
    } else if self.advertising &&
              (!self.enabled || self.peripheralManager.state != .PoweredOn) {
      stopAdvertising()

      for (_, connection) in self.connectionsById {
        self.cleanupConnection(connection)
      }
    }
  }

  private func cleanupConnection(connection: Connection) {
    let central = connection.central
    let peripheral = connection.peripheral

    self.centralManager.cancelPeripheralConnection(peripheral)

    self.connectionsById[connection.id] = nil
    self.connectionsByCentral[central] = nil
    self.connectionsByPeripheral[peripheral] = nil

    for var index = 0; index < self.pendingWrites.count; {
      if self.pendingWrites[index] === central {
        self.pendingWrites.removeAtIndex(index)
      } else {
        index++
      }
    }

    self.socketManager.disconnect(connection.id)
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
        self.peripheralManager.updateValue(
          chunk,
          forCharacteristic: self.characteristic,
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

  func centralManagerDidUpdateState(central: CBCentralManager) {
    assert(central === self.centralManager)

    log.info("CentralManager state changed: \(central.state.rawValue)")
  }

  func centralManager(central: CBCentralManager,
                      didConnectPeripheral peripheral: CBPeripheral) {
    assert(central === self.centralManager)
    assert(peripheral.delegate == nil)

    log.info("Peripheral connected: \(peripheral)")

    if let connection = self.connectionsByPeripheral[peripheral] {
      peripheral.delegate = self
      if connection.rssiUpdatePending {
        connection.rssiUpdatePending = false
        peripheral.readRSSI()
      }
    } else {
      self.centralManager.cancelPeripheralConnection(peripheral)
    }
  }

  func centralManager(central: CBCentralManager,
                      didFailToConnectPeripheral peripheral: CBPeripheral,
                      error: NSError?) {
    assert(central === self.centralManager)
    assert(peripheral.delegate == nil)

    log.info("Peripheral failed to connect: \(peripheral), \(error)")
  }

  func centralManager(central: CBCentralManager,
                      didDisconnectPeripheral peripheral: CBPeripheral,
                      error: NSError?) {
    assert(central === self.centralManager)
    assert(peripheral.delegate != nil)

    log.info("Peripheral disconnected: \(peripheral), \(error)")

    peripheral.delegate = nil
  }

  func peripheralManagerDidUpdateState(peripheral: CBPeripheralManager) {
    assert(peripheral === self.peripheralManager)

    log.info("PeripheralManager state changed: \(peripheral.state.rawValue)")

    updateState()
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         didAddService service: CBService,
                         error: NSError?) {
    assert(peripheral === self.peripheralManager)

    if error == nil {
      log.debug("Added service")
    } else {
      log.error("Failed to add service: \(error?.localizedDescription)")
    }
  }

  func peripheralManagerDidStartAdvertising(peripheral: CBPeripheralManager,
                                            error: NSError?) {
    assert(peripheral === self.peripheralManager)

    if error == nil {
      log.debug("Started advertising")
    } else {
      log.error("Failed to start advertising: \(error?.localizedDescription)")
      self.advertising = false
    }
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         didReceiveReadRequest request: CBATTRequest) {
    assert(peripheral === self.peripheralManager)

    log.info("Received unsupported read request for uuid: " +
             "\(request.characteristic.UUID)");

    var error: CBATTError
    if request.characteristic.UUID == characteristicUuid {
      error = .ReadNotPermitted
    } else {
      error = .RequestNotSupported
    }

    peripheral.respondToRequest(request, withResult: error)
  }
  
  func peripheralManager(peripheral: CBPeripheralManager,
                         didReceiveWriteRequests requests: [CBATTRequest]) {
    assert(peripheral === self.peripheralManager)

    // If any request fails then we are supposed to pretend like all of them
    // failed, so modifications to our data are held on the stack until we know
    // that all requests succeeded.
    var pendingData = [Connection: NSMutableData]()

    for request in requests {
      if request.characteristic.UUID != characteristicUuid {
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
    assert(peripheral === self.peripheralManager)

    if characteristic.UUID == characteristicUuid {

      if let _ = self.connectionsByCentral[central] {
        log.error("Central attempted to subscribe more than once!");
      } else {
        let deviceId = [central.identifier]
        let peripheralsWithThisDeviceId =
          self.centralManager.retrievePeripheralsWithIdentifiers(deviceId)
        assert(peripheralsWithThisDeviceId.count == 1,
               "Central not available as peripheral")

        let centralAsPeripheral = peripheralsWithThisDeviceId[0]
        self.centralManager.connectPeripheral(centralAsPeripheral,
                                              options: nil)

        let connection =
          Connection(id: self.nextConnectionId++,
                     central: central,
                     peripheral: centralAsPeripheral)

        self.connectionsById[connection.id] = connection
        self.connectionsByCentral[central] = connection
        self.connectionsByPeripheral[centralAsPeripheral] = connection

        self.socketManager.connect(connection.id)
      }
    } else {
      log.debug("Subscribed to characteristic: \(characteristic.UUID)");
    }
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         central: CBCentral,
                         didUnsubscribeFromCharacteristic characteristic: CBCharacteristic) {
    assert(peripheral === self.peripheralManager)

    if characteristic.UUID == characteristicUuid {
      if let connection = self.connectionsByCentral[central] {
        self.cleanupConnection(connection)
      }
    } else {
      log.debug("Unsubscribed from characteristic: \(characteristic.UUID)");
    }
  }

  func peripheralManagerIsReadyToUpdateSubscribers(peripheral: CBPeripheralManager) {
    assert(peripheral === self.peripheralManager)

    self.sendOutgoingData()
  }

  func peripheral(peripheral: CBPeripheral,
                  didReadRSSI RSSI: NSNumber,
                  error: NSError?) {
    if error != nil {
      log.error("Failed to update rssi for peripheral \(peripheral): " +
                "\(error)")
      return
    }

    if let connection = self.connectionsByPeripheral[peripheral] {
      self.socketManager.rssiUpdate(connection.id, rssi: RSSI.integerValue)
    } else {
      log.debug("Received rssi update for unknown peripheral, ignoring");
    }
  }
}

private func ==(lhs: HomeBeacon.Connection, rhs: HomeBeacon.Connection) -> Bool {
  return lhs === rhs;
}
