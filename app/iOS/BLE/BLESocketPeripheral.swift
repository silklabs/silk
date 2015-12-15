import Foundation
import CoreBluetooth

private let log = DebugLog.create("silk-BLESocketPeripheral")

internal class BLESocketPeripheral: NSObject,
                                    CBCentralManagerDelegate,
                                    CBPeripheralManagerDelegate,
                                    CBPeripheralDelegate {

  // This is the maximum characteristic length that can currently be handled by
  // silk-device due to the way it uses a socket buffer with a small fixed size.
  private static let kMaxCharacteristicLength = 400

  // The characteristic length that we would like to send has to be the less
  // than kMaxCharacteristicLength but it should also be small enough that we
  // don't starve the receiving side while it waits to receive a huge value.
  // Each bluetooth packet contains at most 22 bytes of payload, so an even
  // multiple of 22 should be used so that we don't waste space in a packet. Our
  // encryption algorithm uses a block cipher that emits chunks of 16 bytes, and
  // we always have to send the total length in a single byte, so each message
  // should be |(16 * N) + 1| bytes. On average our messages tend to be ~48-64
  // bytes, so two of them should be ~130 bytes. Thus we'd only be wasting 2
  // bytes in a 6 packet message if we aim for 132 bytes desired length. We can
  // of course tune this later if we need to.
  private static let kDesiredCharacteristicLength = 132

  private static var instance: BLESocketPeripheral? = nil

  // This will be the 'local name' for the device when advertising.
  private static let deviceName = "Silk-app"

  private class Service: CBMutableService {
    // This characteristic is used for sending data.
    static let readCharacteristicUuid =
      CBUUID(string: "9c333756-62c3-4141-8ee5-fed0d9f84a72")
    let readCharacteristicProperties: CBCharacteristicProperties = [
      .Notify,
      .Read,
      .Write,
    ]
    let readCharacteristicPermissions: CBAttributePermissions = [
      .Readable,
      .Writeable,
    ]

    // This characteristic is used for receiving data.
    static let writeCharacteristicUuid =
      CBUUID(string: "ef4cf114-5d10-4b73-8a5f-214aae42c6f9")
    let writeCharacteristicProperties: CBCharacteristicProperties = [
      .Write,
    ]
    let writeCharacteristicPermissions: CBAttributePermissions = [
      .Writeable,
    ]

    let readCharacteristic: CBMutableCharacteristic
    let writeCharacteristic: CBMutableCharacteristic

    init(type UUID: CBUUID) {
      self.readCharacteristic =
        CBMutableCharacteristic(type: Service.readCharacteristicUuid,
                                properties: readCharacteristicProperties,
                                value: nil,
                                permissions: readCharacteristicPermissions)
      self.writeCharacteristic =
        CBMutableCharacteristic(type: Service.writeCharacteristicUuid,
                                properties: writeCharacteristicProperties,
                                value: nil,
                                permissions: writeCharacteristicPermissions)

      super.init(type: UUID, primary: true)

      self.characteristics = [
        self.readCharacteristic,
        self.writeCharacteristic,
      ]
    }
  }

  // This class holds outgoing data until it can be sent.
  private class Connection : Hashable {
    let id: Int
    let central: CBCentral
    let peripheral: CBPeripheral
    let readCharacteristic: CBMutableCharacteristic
    let writeCharacteristic: CBMutableCharacteristic

    var rssiUpdatePending: Bool = false
    var outgoingQueue: [NSData] = [NSData]()
    var outgoingLength: Int = 0
    var needsNotify: Bool = false
    var notifyPending: Bool = false
    var currentReadData: NSData? = nil

    var hashValue: Int {
      return unsafeAddressOf(self).hashValue
    }

    init(id: Int,
         central: CBCentral,
         peripheral: CBPeripheral,
         readCharacteristic: CBMutableCharacteristic,
         writeCharacteristic: CBMutableCharacteristic) {
      self.id = id
      self.central = central
      self.peripheral = peripheral
      self.readCharacteristic = readCharacteristic
      self.writeCharacteristic = writeCharacteristic
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
  private let regionMonitor: RegionMonitor

  private var inForeground: Bool = false
  private var enabled: Bool = false
  private var advertising: Bool = false
  private var advertisingAllowed: Bool = false
  private var services: [CBUUID: ServiceInfo] = [:]

  private var connectionsById = [Int: Connection]()
  private var connectionsByCentral = [CBCentral: Connection]()
  private var connectionsByPeripheral = [CBPeripheral: Connection]()
  private var connectionsByService = [CBUUID: Connection]()

  private var pendingNotifies = [Connection]()
  private var nextConnectionId = 0

  init(regionMonitor: RegionMonitor) {
    log.debug("BLESocketPeripheral()")

    self.regionMonitor = regionMonitor
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
    log.debug("send(\(id), \(data.length))")

    assert(data.length != 0)

    if let connection = self.connectionsById[id] {
      connection.outgoingQueue.append(data)
      connection.outgoingLength += data.length

      if connection.needsNotify && !connection.notifyPending {
        if self.notifyConnection(connection) {
          connection.needsNotify = false
        } else {
          self.pendingNotifies.append(connection)
          connection.notifyPending = true
        }
      }
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

    assert(self.services[serviceUuid] != nil)

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

    var connectionsToCleanUp = [Connection]()

    for connection in self.connectionsById.values {
      if connection.readCharacteristic.service.UUID == service.UUID {
        connectionsToCleanUp.append(connection)
      }
    }

    for connection in connectionsToCleanUp {
      self.cleanupConnection(connection)
    }
  }

  private func getOrCreateConnection(central: CBCentral,
                                     characteristic: CBCharacteristic)
                                     -> Connection? {
    log.debug("getOrCreateConnection('\(central.identifier)', " +
              "'\(characteristic.UUID)'")

    let serviceUuid = characteristic.service.UUID

    if let connection = self.connectionsByCentral[central] {
      if self.connectionsByService[serviceUuid] === connection {
        log.debug("Central already connected to this service")
        return connection
      }

      log.error("Central already connected to a different service")
      return nil
    }

    if self.connectionsByService[serviceUuid] != nil {
      log.error("Another central is already connected to this service")
      return nil
    }

    if (self.services[serviceUuid] == nil) {
      log.error("No service registered for '\(serviceUuid)")
      return nil
    }

    let serviceInfo = self.services[serviceUuid]!
    assert(serviceInfo.service != nil)

    let readCharacteristic = serviceInfo.service!.readCharacteristic
    let writeCharacteristic = serviceInfo.service!.writeCharacteristic

    assert(characteristic === readCharacteristic ||
           characteristic === writeCharacteristic)

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
                 readCharacteristic: readCharacteristic,
                 writeCharacteristic: writeCharacteristic)

    log.debug("Created new connection with id \(connection.id)")

    self.connectionsById[connection.id] = connection
    self.connectionsByCentral[central] = connection
    self.connectionsByPeripheral[centralAsPeripheral] = connection
    self.connectionsByService[serviceUuid] = connection

    self.peripheralManager.setDesiredConnectionLatency(.Low,
                                                       forCentral: central)

    self.socketManager.connect(connection.id)
    return connection
  }

  private func cleanupConnection(connection: Connection) {
    log.debug("cleanupConnection(\(connection.id))")

    let central = connection.central
    let characteristic = connection.readCharacteristic
    let peripheral = connection.peripheral

    self.centralManager.cancelPeripheralConnection(peripheral)

    self.connectionsById[connection.id] = nil
    self.connectionsByCentral[central] = nil
    self.connectionsByPeripheral[peripheral] = nil
    self.connectionsByService[characteristic.service.UUID] = nil

    for var index = 0; index < self.pendingNotifies.count; index++ {
      if self.pendingNotifies[index].central === central {
        self.pendingNotifies.removeAtIndex(index)
        break
      }
    }

    self.socketManager.disconnect(connection.id)
  }

  private func notifyConnection(connection: Connection) -> Bool {
    log.debug("notifyConnection(\(connection.id)")

    assert(connection.needsNotify)

    let data = NSData()
    let characteristic = connection.readCharacteristic
    let centrals = [connection.central]

    return self.peripheralManager.updateValue(data,
                                              forCharacteristic: characteristic,
                                              onSubscribedCentrals: centrals)
  }

  private func collectReadData(connection: Connection) {
    log.debug("collectReadData(\(connection.id))")

    if connection.currentReadData != nil {
      return
    }

    if connection.outgoingLength == 0 {
      log.debug("No outgoing data")
      return
    }

    assert(connection.outgoingLength > 0)
    assert(connection.outgoingQueue.count != 0)

    let maxLength: Int = min(connection.outgoingLength,
                             BLESocketPeripheral.kMaxCharacteristicLength,
                             BLESocketPeripheral.kDesiredCharacteristicLength)

    // Build up a contiguous chunk of data to send.
    var chunks = [NSData]()
    var chunksLength = 0

    var index = 0
    for ; index < connection.outgoingQueue.count && chunksLength < maxLength; {
      var chunk = connection.outgoingQueue[index]

      let availableLength = maxLength - chunksLength
      assert(availableLength > 0)

      // If we can't fit all the data then slice it up for the next chunk.
      if chunk.length > availableLength {
        let chunkRange = NSRange(location: 0, length: availableLength)
        let remainingRange = NSRange(location: availableLength,
                                     length: chunk.length - availableLength)
        connection.outgoingQueue[index] = chunk.subdataWithRange(remainingRange)
        chunk = chunk.subdataWithRange(chunkRange)
      } else {
        index++
      }

      chunks.append(chunk)
      chunksLength += chunk.length

      assert(chunksLength <= maxLength)
      assert(chunksLength <= connection.outgoingLength)
    }

    assert(chunks.count != 0)
    assert(chunksLength != 0)

    // Pull any completely consumed data out of the array.
    if index != 0 {
      connection.outgoingQueue.removeFirst(index)
    }

    if chunks.count == 1 {
      connection.currentReadData = chunks[0]
    } else {
      let mutableData: NSMutableData! = NSMutableData(capacity: chunksLength)
      for chunk in chunks {
        mutableData.appendData(chunk)
      }
      connection.currentReadData = mutableData
    }
    assert(connection.outgoingLength >= chunksLength)
    connection.outgoingLength -= chunksLength

    log.debug("Next outgoing chunk is \(connection.currentReadData!.length) " +
              "bytes")
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

    if (peripheral.state == .PoweredOn) {
      dispatch_async(dispatch_get_main_queue()) {
        self.regionMonitor.updateState()
      }
    }

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

    if request.characteristic.UUID != Service.readCharacteristicUuid {
      if request.characteristic.UUID == Service.writeCharacteristicUuid {
        log.debug("Received read request for write characteristic")
        peripheral.respondToRequest(request, withResult: .ReadNotPermitted)
      } else {
        log.debug("Received read request for unsupported characteristic " +
                  "'\(request.characteristic.UUID)'")
        peripheral.respondToRequest(request, withResult: .RequestNotSupported)
      }
      return
    }

    var connection = self.connectionsByCentral[request.central]
    if connection == nil {
      connection = getOrCreateConnection(request.central,
                                         characteristic: request.characteristic)
      if connection == nil {
        peripheral.respondToRequest(request, withResult: .RequestNotSupported)
        return
      }
    }
    assert(connection != nil)

    let requestServiceUuid = request.characteristic.service.UUID
    if connection!.readCharacteristic.service.UUID != requestServiceUuid {
      // Each central is only allowed to read from the characteristic on a
      // single service.
      log.debug("Received read request for another central's service")
      peripheral.respondToRequest(request, withResult: .ReadNotPermitted)
      return
    }

    log.debug("didReceiveReadRequest(\(connection!.id), \(request.offset)")

    self.collectReadData(connection!)

    var data = connection!.currentReadData
    if (data == nil) {
      connection!.needsNotify = true
    }

    if request.offset != 0 {
      if data == nil || request.offset > data!.length {
        log.debug("Received read request with invalid offset \(request.offset)")
        peripheral.respondToRequest(request, withResult: .InvalidOffset)
        return
      }

      let range = NSRange(location: request.offset,
                          length: data!.length - request.offset)
      data = data!.subdataWithRange(range)
    }

    request.value = data
    peripheral.respondToRequest(request, withResult: .Success)
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         didReceiveWriteRequests requests: [CBATTRequest]) {
    assert(peripheral === self.peripheralManager)

    // If any request fails then we are supposed to pretend like all of them
    // failed, so modifications to our data are held on the stack until we know
    // that all requests succeeded.
    var pendingData = [Connection: NSMutableData]()
    var expiredData = Set<Connection>()

    for request in requests {
      if request.characteristic.UUID != Service.readCharacteristicUuid &&
         request.characteristic.UUID != Service.writeCharacteristicUuid{
        log.debug("Received write request for unsupported characteristic " +
                  "'\(request.characteristic.UUID)'")
        peripheral.respondToRequest(request, withResult: .RequestNotSupported)
        return
      }

      if request.offset != 0 {
        log.debug("Received write request for unsupported offset " +
                  "\(request.offset)")
        peripheral.respondToRequest(request, withResult: .InvalidOffset)
        return
      }

      var connection = self.connectionsByCentral[request.central]
      if connection == nil {
        connection = getOrCreateConnection(request.central,
                                           characteristic: request.characteristic)
        if connection == nil {
          peripheral.respondToRequest(request, withResult: .RequestNotSupported)
          return
        }
      }
      assert(connection != nil)

      let requestServiceUuid = request.characteristic.service.UUID
      if connection!.writeCharacteristic.service.UUID != requestServiceUuid {
        // Each central is only allowed to write to the characteristic on a
        // single service.
        log.debug("Received write request for another central's service")
        peripheral.respondToRequest(request, withResult: .WriteNotPermitted)
        return
      }

      if request.characteristic.UUID == Service.writeCharacteristicUuid {
        let data = pendingData[connection!]
        if data == nil {
          pendingData[connection!] = NSMutableData(data: request.value!)
        } else {
          data!.appendData(request.value!)
        }
      } else {
        assert(request.characteristic.UUID == Service.readCharacteristicUuid)
        expiredData.insert(connection!)
      }
    }

    // All requests succeeded.
    peripheral.respondToRequest(requests[0], withResult: .Success)

    // Expire old data.
    for connection in expiredData {
      log.debug("Expiring old data for connection \(connection.id)")
      connection.currentReadData = nil
    }

    // Send the incoming data to JS.
    for (connection, data) in pendingData {
      self.socketManager.receive(connection.id, data: data)
    }
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         central: CBCentral,
                         didSubscribeToCharacteristic characteristic: CBCharacteristic) {
    log.debug("didSubscribeToCharacteristic('\(characteristic.UUID)'")
    assert(peripheral === self.peripheralManager)

    if characteristic.UUID != Service.readCharacteristicUuid {
      return
    }

    if self.connectionsByCentral[central] == nil {
      self.getOrCreateConnection(central, characteristic: characteristic)
    } else {
      log.debug("Central attempted to subscribe more than once")
    }
  }

  func peripheralManager(peripheral: CBPeripheralManager,
                         central: CBCentral,
                         didUnsubscribeFromCharacteristic characteristic: CBCharacteristic) {
    log.debug("didUnsubscribeFromCharacteristic('\(characteristic.UUID)'")
    assert(peripheral === self.peripheralManager)

    if characteristic.UUID != Service.readCharacteristicUuid {
      return
    }

    if let connection = self.connectionsByCentral[central] {
      assert(connection.readCharacteristic === characteristic)
      self.cleanupConnection(connection)
    }
  }

  func peripheralManagerIsReadyToUpdateSubscribers(peripheral: CBPeripheralManager) {
    log.debug("peripheralManagerIsReadyToUpdateSubscribers()")
    assert(peripheral === self.peripheralManager)

    var index = 0
    for ; index < self.pendingNotifies.count; index++ {
      let connection = self.pendingNotifies[index]

      assert(connection.needsNotify)
      assert(connection.notifyPending)

      if self.notifyConnection(connection) {
        connection.needsNotify = false
        connection.notifyPending = false
      } else {
        break
      }
    }

    if index > 0 {
      self.pendingNotifies.removeFirst(index)
    }
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
    }
  }
}

private func ==(lhs: BLESocketPeripheral.Connection,
                rhs: BLESocketPeripheral.Connection) -> Bool {
  return lhs === rhs
}
