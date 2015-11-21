import Foundation
import CoreBluetooth

private let log = DebugLog.create("silk-BLESocketPeripheral")

internal class BLESocketPeripheral: NSObject,
                                    CBCentralManagerDelegate,
                                    CBPeripheralManagerDelegate,
                                    CBPeripheralDelegate {

  private static var instance: BLESocketPeripheral? = nil

  // This will be the 'local name' for the device when advertising.
  private static let deviceName = "Silk-app"

  private class Service: CBMutableService {
    // This characteristic is used for sending and receiving data.
    static let characteristicUuid =
      CBUUID(string: "59ba85fb-6fba-439c-95b0-9307e62d4ca1")

    let mutableCharacteristic: CBMutableCharacteristic
  
    init(type UUID: CBUUID) {
      self.mutableCharacteristic =
        CBMutableCharacteristic(type: Service.characteristicUuid,
                                properties: [
                                  .Indicate,
                                  .Write,
                                ],
                                value: nil,
                                permissions: CBAttributePermissions.Writeable)

      super.init(type: UUID, primary: true)

      self.characteristics = [self.mutableCharacteristic]
    }
  }

  // This class holds outgoing data until it can be sent.
  private class Connection : Hashable {
    let id: Int
    let central: CBCentral
    let peripheral: CBPeripheral
    let characteristic: CBMutableCharacteristic
    var rssiUpdatePending: Bool = false
    var outgoingQueue = [NSData]()

    var hashValue: Int {
      return unsafeAddressOf(self).hashValue
    }

    init(id: Int,
         central: CBCentral,
         peripheral: CBPeripheral,
         characteristic: CBMutableCharacteristic) {
      self.id = id
      self.central = central
      self.peripheral = peripheral
      self.characteristic = characteristic
    }
  }

  private class ServiceInfo {
    let requiresForeground: Bool
    var service: Service? = nil
    var enabled: Bool = false
    var installed: Bool = false

    init(requiresForeground: Bool) {
      self.requiresForeground = requiresForeground
    }
  }

  private var queue: dispatch_queue_t
  private var peripheralManager: CBPeripheralManager
  private var centralManager: CBCentralManager
  private var socketManager: BLESocketManager

  private var inForeground: Bool = false
  private var enabled: Bool = false
  private var advertising: Bool = false
  private var advertisingAllowed: Bool = false
  private var services: [CBUUID: ServiceInfo] = [:]

  private var connectionsById = [Int: Connection]()
  private var connectionsByCentral = [CBCentral: Connection]()
  private var connectionsByPeripheral = [CBPeripheral: Connection]()
  private var pendingWrites = [Connection]()
  private var nextConnectionId = 0

  override init() {
    log.debug("BLESocketPeripheral()")

    self.socketManager = BLESocketManager.getOrCreateInstance()
    self.queue = self.socketManager.methodQueue

    self.peripheralManager =
      CBPeripheralManager(delegate: nil, queue: self.queue)
    self.centralManager = CBCentralManager(delegate: nil, queue: self.queue)

    super.init()

    assert(BLESocketPeripheral.instance == nil,
           "Can't have more than one instance!")
    BLESocketPeripheral.instance = self

    BLESocketManager.setSocketPeripheral(self)

    self.peripheralManager.delegate = self
    self.centralManager.delegate = self
  }

  func updateSocketManager(socketManager: BLESocketManager) {
    self.socketManager = socketManager
  }

  func setForeground() {
    dispatch_async(self.queue) {
      log.debug("setForeground")
      assert(!self.inForeground)
      self.inForeground = true

      if !self.enabled || !self.advertisingAllowed {
        return
      }

      var servicesToAdd: [ServiceInfo] = []

      for (uuid, serviceInfo) in self.services {
        if serviceInfo.requiresForeground && serviceInfo.enabled {
          assert(!serviceInfo.installed)
          if serviceInfo.service == nil {
            serviceInfo.service = Service(type: uuid)
          }
          servicesToAdd.append(serviceInfo)
        }
      }

      if !servicesToAdd.isEmpty {
        self.maybeStopAdvertising()

        for serviceInfo in servicesToAdd {
          self.peripheralManager.addService(serviceInfo.service!)
          serviceInfo.installed = true

          log.debug("Added service \(serviceInfo.service!.UUID)")
        }

        self.maybeStartAdvertising()
      }
    }
  }

  func setBackground() {
    dispatch_async(self.queue) {
      log.debug("setBackground")
      assert(self.inForeground)
      self.inForeground = false

      if !self.enabled || !self.advertisingAllowed {
        return
      }

      var servicesToRemove: [ServiceInfo] = []

      for serviceInfo in self.services.values {
        if serviceInfo.requiresForeground && serviceInfo.installed {
          assert(serviceInfo.service != nil)
          servicesToRemove.append(serviceInfo)
        }
      }

      if !servicesToRemove.isEmpty {
        self.maybeStopAdvertising()

        for serviceInfo in servicesToRemove {
          self.removeAndCleanupService(serviceInfo.service!)
          serviceInfo.installed = false

          log.debug("Removed service \(serviceInfo.service!.UUID)")
        }

        self.maybeStartAdvertising()
      }
    }
  }

  func addServiceUuid(uuid: NSUUID) {
    let requiresForeground = uuid == RegionMonitor.configBeaconUuid

    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("addServiceUuid(\(serviceUuid))")

      assert(self.services[serviceUuid] == nil)

      self.services[serviceUuid] =
        ServiceInfo(requiresForeground: requiresForeground)
    }
  }

  func removeServiceUuid(uuid: NSUUID) {
    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("removeServiceUuid(\(serviceUuid))")

      assert(self.services[serviceUuid] != nil)

      let serviceInfo = self.services[serviceUuid]!

      self.stopAdvertisingServiceUuidInternal(serviceUuid)

      serviceInfo.enabled = false
      serviceInfo.service = nil

      self.services[serviceUuid] = nil
    }
  }

  func startAdvertisingServiceUuid(uuid: NSUUID) {
    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("startAdvertisingServiceUuid(\(serviceUuid))")

      assert(self.services[serviceUuid] != nil)

      let serviceInfo = self.services[serviceUuid]!

      if serviceInfo.service == nil {
        serviceInfo.service = Service(type: serviceUuid)
      }

      assert(!serviceInfo.enabled)
      assert(!serviceInfo.installed)

      serviceInfo.enabled = true

      if !self.enabled || !self.advertisingAllowed {
        return
      }

      if serviceInfo.requiresForeground && !self.inForeground {
        return
      }

      self.maybeStopAdvertising()

      self.peripheralManager.addService(serviceInfo.service!)
      serviceInfo.installed = true

      self.maybeStartAdvertising()
    }
  }

  func stopAdvertisingServiceUuid(uuid: NSUUID) {
    dispatch_async(self.queue) {
      self.stopAdvertisingServiceUuidInternal(CBUUID(NSUUID: uuid))
    }
  }

  func setEnabled(enabled: Bool) {
    self.enabled = enabled
    self.updateState()
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

  private func stopAdvertisingServiceUuidInternal(serviceUuid: CBUUID) {
    log.debug("stopAdvertisingServiceUuid(\(serviceUuid))")

    if self.services[serviceUuid] == nil {
      return
    }

    let serviceInfo = self.services[serviceUuid]!
    if serviceInfo.enabled {
      assert(serviceInfo.service != nil)

      serviceInfo.enabled = false

      if serviceInfo.installed {
        self.maybeStopAdvertising()

        self.removeAndCleanupService(serviceInfo.service!)
        serviceInfo.installed = false

        self.maybeStartAdvertising()
      }
    }
  }

  private func addAllServices() {
    log.debug("addAllServices()")

    assert(self.enabled)
    assert(self.advertisingAllowed)
    assert(!self.advertising, "Already advertising")

    for (uuid, serviceInfo) in self.services {
      assert(!serviceInfo.installed)

      if serviceInfo.enabled &&
         (!serviceInfo.requiresForeground || self.inForeground) {
        if serviceInfo.service == nil {
          serviceInfo.service = Service(type: uuid)
        }
        self.peripheralManager.addService(serviceInfo.service!)
        serviceInfo.installed = true

        log.debug("Added service \(serviceInfo.service!.UUID)")
      }
    }
  }

  private func removeAllServices() {
    log.debug("removeAllServices()")

    assert(!self.advertising, "Still advertising")

    for serviceInfo in self.services.values {
      if serviceInfo.installed {
        assert(serviceInfo.service != nil)
        self.removeAndCleanupService(serviceInfo.service!)
        serviceInfo.installed = false

        log.debug("Removed service \(serviceInfo.service!.UUID)")
      }
    }
  }

  private func maybeStartAdvertising() {
    log.debug("maybeStartAdvertising()")

    assert(!self.advertising, "Already advertising")

    if !self.enabled || !self.advertisingAllowed {
      return
    }

    var services: [CBUUID] = []
    for (uuid, serviceInfo) in self.services {
      if serviceInfo.installed {
        services.append(uuid)
      }
    }

    if services.isEmpty {
      return
    }

    let dataToBeAdvertised: [String: AnyObject!] = [
      CBAdvertisementDataLocalNameKey: BLESocketPeripheral.deviceName,
      CBAdvertisementDataServiceUUIDsKey: services
    ]

    self.peripheralManager.startAdvertising(dataToBeAdvertised)
    self.advertising = true
  }

  private func maybeStopAdvertising() {
    log.debug("maybeStopAdvertising()")

    if self.advertising {
      self.peripheralManager.stopAdvertising()
      self.advertising = false
    }
  }

  private func updateState() {
    log.debug("updateState() " +
              "peripheralState: \(self.peripheralManager.state.rawValue) " +
              "enabled: \(self.enabled) " +
              "inForeground: \(self.inForeground) " +
              "advertisingAllowed: \(self.advertisingAllowed) " +
              "advertising: \(self.advertising)")

    if self.advertisingAllowed {
      if !self.enabled ||
         self.peripheralManager.state != .PoweredOn {
        self.maybeStopAdvertising()
        self.removeAllServices()
        self.advertisingAllowed = false

        for (_, connection) in self.connectionsById {
          self.cleanupConnection(connection)
        }
      }
    } else if self.enabled &&
         self.peripheralManager.state == .PoweredOn {
      self.advertisingAllowed = true
      self.addAllServices()
      self.maybeStartAdvertising()
    }
  }

  private func removeAndCleanupService(service: Service) {
    log.debug("removeAndCleanupService(\(service.UUID))")

    self.peripheralManager.removeService(service)

    var connectionsToCleanUp: [Connection] = []

    for connection in self.connectionsById.values {
      if connection.characteristic.service.UUID == service.UUID {
        connectionsToCleanUp.append(connection)
      }
    }

    for connection in connectionsToCleanUp {
      self.cleanupConnection(connection)
    }
  }

  private func cleanupConnection(connection: Connection) {
    log.debug("cleanupConnection(\(connection.id))")
    let central = connection.central
    let characteristic = connection.characteristic
    let peripheral = connection.peripheral

    self.centralManager.cancelPeripheralConnection(peripheral)

    self.connectionsById[connection.id] = nil
    self.connectionsByCentral[central] = nil
    self.connectionsByPeripheral[peripheral] = nil

    for var index = 0; index < self.pendingWrites.count; {
      if self.pendingWrites[index].central === central ||
         self.pendingWrites[index].characteristic === characteristic ||
         self.pendingWrites[index].peripheral === peripheral {
        self.pendingWrites.removeAtIndex(index)
      } else {
        index++
      }
    }

    self.socketManager.disconnect(connection.id)
  }

  private func sendConnectionOutgoingData(connection: Connection!) -> Bool {
    log.debug("sendConnectionOutgoingData(\(connection.id))");
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

      var index = 0
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

      log.debug("Sending \(chunk.length) bytes");
      let success =
        self.peripheralManager.updateValue(
          chunk,
          forCharacteristic: connection.characteristic,
          onSubscribedCentrals: [connection.central])
      log.debug("Sent \(chunk.length) bytes successfully? \(success)");

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
    log.debug("sendOutgoingData()");
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
      log.debug("Added service \(service.UUID)")
    } else {
      log.error("Failed to add service \(service.UUID): " +
                "\(error?.localizedDescription)")
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
             "\(request.characteristic.UUID)")

    let error = request.characteristic.UUID == Service.characteristicUuid ?
                CBATTError.ReadNotPermitted :
                CBATTError.RequestNotSupported
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
      if request.characteristic.UUID != Service.characteristicUuid {
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

      var connection = self.connectionsByCentral[request.central]
      if connection == nil {
        if !registerConnection(request.central,
                               characteristic: request.characteristic) {
          peripheral.respondToRequest(request,
                                      withResult:CBATTError.RequestNotSupported)
          return
        }
        connection = self.connectionsByCentral[request.central]
      }
      assert(connection != nil)

      let requestServiceUuid = request.characteristic.service.UUID
      if connection!.characteristic.service.UUID != requestServiceUuid {
        // Each central is only allowed to write to the characteristic on a
        // single service.
        peripheral.respondToRequest(request,
                                    withResult:CBATTError.WriteNotPermitted)
        return
      }

      let data = pendingData[connection!]
      if data == nil {
        pendingData[connection!] = NSMutableData(data: request.value!)
      } else {
        data!.appendData(request.value!)
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

    if characteristic.UUID == Service.characteristicUuid {
      if let _ = self.connectionsByCentral[central] {
        log.debug("Central attempted to subscribe more than once!")
      } else {
        if !self.registerConnection(central, characteristic: characteristic) {
          log.error("Subscribed to characteristic '\(characteristic.UUID)' " +
                    "that belongs to unknown service " +
                    "'\(characteristic.service.UUID)'")
        }
      }
    } else {
      log.debug("Subscribed to characteristic '\(characteristic.UUID)'")
    }
  }

  private func registerConnection(central: CBCentral,
                                  characteristic: CBCharacteristic) -> Bool {
    log.debug("registerConnection()")

    assert(self.connectionsByCentral[central] == nil)

    let serviceUuid = characteristic.service.UUID;
    if (self.services[serviceUuid] == nil) {
      return false
    }

    let serviceInfo = self.services[serviceUuid]!
    assert(serviceInfo.service != nil)
    
    let mutableCharacteristic = serviceInfo.service!.mutableCharacteristic
    assert(mutableCharacteristic === characteristic)

    let deviceId = [central.identifier]
    let peripheralsWithThisDeviceId =
      self.centralManager.retrievePeripheralsWithIdentifiers(deviceId)
    assert(peripheralsWithThisDeviceId.count == 1,
           "Central not available as peripheral")

    let centralAsPeripheral = peripheralsWithThisDeviceId[0]
    self.centralManager.connectPeripheral(centralAsPeripheral, options: nil)

    let connection =
      Connection(id: self.nextConnectionId++,
                 central: central,
                 peripheral: centralAsPeripheral,
                 characteristic: mutableCharacteristic)

    self.connectionsById[connection.id] = connection
    self.connectionsByCentral[central] = connection
    self.connectionsByPeripheral[centralAsPeripheral] = connection

    self.socketManager.connect(connection.id)
    return true
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         central: CBCentral,
                         didUnsubscribeFromCharacteristic characteristic: CBCharacteristic) {
    assert(peripheral === self.peripheralManager)

    if characteristic.UUID == Service.characteristicUuid {
      if let connection = self.connectionsByCentral[central] {
        self.cleanupConnection(connection)
      }
    } else {
      log.debug("Unsubscribed from characteristic: \(characteristic.UUID)")
    }
  }

  func peripheralManagerIsReadyToUpdateSubscribers(peripheral: CBPeripheralManager) {
    log.debug("peripheralManagerIsReadyToUpdateSubscribers()")
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
      log.debug("Received rssi update for unknown peripheral, ignoring")
    }
  }
}

private func ==(lhs: BLESocketPeripheral.Connection,
                rhs: BLESocketPeripheral.Connection) -> Bool {
  return lhs === rhs
}
