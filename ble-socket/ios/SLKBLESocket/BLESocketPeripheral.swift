import Foundation
import CoreBluetooth

private let log = DebugLog.create("silk-BLESocketPeripheral")

private protocol ManufacturerData {
  /**
   * This will always be present.
   */
  var version: Int { get }

  var deviceType: Int? { get }
  var deviceNumber: Int? { get }
}

@objc(BLESocketPeripheral)
public class BLESocketPeripheral: NSObject,
                                  CBCentralManagerDelegate,
                                  CBPeripheralManagerDelegate,
                                  CBPeripheralDelegate {
  /**
   * This is the maximum characteristic length that can currently be handled by
   * silk-device due to the way it uses a socket buffer with a small fixed size.
   */
  private static let kMaxCharacteristicBytes = 400

  /**
   * The characteristic length that we would like to send has to be the less
   * than kMaxCharacteristicLength but it should also be small enough that we
   * don't starve the receiving side while it waits to receive a huge value.
   * Each bluetooth packet contains at most 22 bytes of payload, so an even
   * multiple of 22 should be used so that we don't waste space in a packet. Our
   * encryption algorithm uses a block cipher that emits chunks of 16 bytes, and
   * we always have to send the total length in a single byte, so each message
   * should be |(16 * N) + 1| bytes. On average our messages tend to be ~48-64
   * bytes, so two of them should be ~130 bytes. Thus we'd only be wasting 2
   * bytes in a 6 packet message if we aim for 132 bytes desired length. We can
   * of course tune this later if we need to.
   */
  private static let kDesiredCharacteristicBytes = 132

  private static let kMaxWriteBytes = min(kMaxCharacteristicBytes,
                                          kDesiredCharacteristicBytes)

  /**
   * Sorta looks like "Silk" if you squint hard enough.
   */
  private static let kAdvertisingManufacturerCode = 0x517c

  private static var instance: BLESocketPeripheral? = nil

  private static let configServiceUuid =
    CBUUID(NSUUID: RegionMonitor.configBeaconUuid)

  private struct ManufacturerDataV1 : ManufacturerData {
    let version: Int
    let deviceType: Int?
    let deviceNumber: Int?

    init(version: UInt8, deviceType: UInt16, deviceNumber: UInt16) {
      self.version = Int(version)
      self.deviceType = Int(deviceType)
      self.deviceNumber = Int(deviceNumber)
    }
  }

  private class Service: CBMutableService {
    // Must match BTLE_SOCKET_UUIDS.characteristic from silk-api.
    static let characteristicUuid =
      CBUUID(string: "fd30740d-8bdc-4a4d-ad58-66b4343ea3c1")

    let characteristicProperties: CBCharacteristicProperties = [
      .Notify,
      .Write,
    ]

    let characteristicPermissions: CBAttributePermissions = [
      .Writeable,
    ]

    let characteristic: CBMutableCharacteristic

    init(type UUID: CBUUID) {
      self.characteristic =
        CBMutableCharacteristic(type: Service.characteristicUuid,
                                properties: characteristicProperties,
                                value: nil,
                                permissions: characteristicPermissions)

      super.init(type: UUID, primary: true)

      self.characteristics = [
        self.characteristic,
      ]
    }
  }

  /**
   * Keeps track of which services should be available for scanning.
   */
  private class ServiceInfo {
    /**
     * The actual service instance.
     */
    let service: Service

    var adding: Bool = false
    var added: Bool = false

    /**
     * True when this service is enabled.
     */
    var enabled: Bool

    /**
     * True when any beacon is detected.
     */
    var inBeaconRange: Bool = false

    /**
     * Set of account device numbers that are currently beaconing.
     */
    var deviceNumbersBeaconing: Set<Int> = []

    /**
     * Set of account device numbers for which JS has requested to scan.
     */
    var deviceNumbersRequested: Set<Int> = []

    /**
     * Simple heuristic to determine when we should actually be scanning for
     * this service.
     */
    var shouldScan: Bool {
      get {
        assert(self.inBeaconRange || self.deviceNumbersBeaconing.isEmpty)

        return self.enabled &&
               (self.inBeaconRange || !self.deviceNumbersRequested.isEmpty)
      }
    }

    init(service: Service, enabled: Bool) {
      self.service = service
      self.enabled = enabled
    }
  }

  /**
   * This class holds outgoing data until it can be sent.
   */
  private class Connection : Hashable {
    /**
     * Monotonically increasing unique connection id.
     */
    private static var nextConnectionId = 0

    /**
     * This connection's id.
     */
    let id: Int

    /**
     * Objects that we must hold.
     */
    let peripheral: CBPeripheral
    let peripheralServiceUuid: CBUUID
    let peripheralCharacteristic: CBCharacteristic

    /**
     * Only set once we have subscribed to a central's characteristic.
     */
    var central: CBCentral? = nil
    var rssiUpdatesEnabled: Bool = false

    /**
     * Queue holding data that needs to be delivered.
     */
    var outgoingQueue: [NSData] = [NSData]()

    /**
     * Data that is currently being written to the central's characteristic.
     */
    var currentOutgoingData: NSData?

    /**
     * Set when JS decides that is is done sending data.
     */
    var finished: Bool = false

    /**
     * Set when iOS disconnects the central that we are connected to.
     */
    var disconnected: Bool = false

    /**
     * For |Hashable|.
     */
    var hashValue: Int {
      return self.id
    }

    init(characteristic: CBCharacteristic) {
      self.id = Connection.nextConnectionId
      Connection.nextConnectionId += 1

      self.peripheral = characteristic.service.peripheral
      self.peripheralServiceUuid = characteristic.service.UUID
      self.peripheralCharacteristic = characteristic
    }
  }

  /**
   * The event queue on which all our bluetooth code runs.
   */
  private var queue: dispatch_queue_t

  /**
   * iOS objects.
   */
  private var centralManager: CBCentralManager
  private var peripheralManager: CBPeripheralManager

  /**
   * Our connection to JS.
   */
  private var socketManager: BLESocketManager

  /**
   * A connection to the |RegionMonitor| lets us force region updates whenever
   * CoreBluetooth changes its power state.
   */
  private let regionMonitor: RegionMonitor

  /**
   * True when services have been added.
   */
  private var servicesAdded: Bool = false

  /**
   * The map of all services we may need to install. At present this can only be
   * one (the config service) or two (the account service).
   */
  private var services: [CBUUID: ServiceInfo] = [:]

  /**
   * Whether or not the app is currently in the foreground.
   */
  private var inForeground: Bool = false

  /**
   * Whether or not we are currently scanning for peripherals.
   */
  private var scanning: Bool = false

  /**
   * A list of peripherals that we are connected to but for which we haven't yet
   * determined if we can open a socket connection.
   */
  private var pendingPeripherals = Set<CBPeripheral>()

  /**
   * Whether or not JS is ready to accept incoming connections.
   */
  private var enabled: Bool = false

  /**
   * A flag indicating the presence of unconfigured devices at the time we last
   * communicated with JS.
   */
  private var unconfiguredDevicesInRange: Bool = false

  /**
   * A flag indicating whether or not JS has requested us to scan for
   * unconfigured devices.
   */
  private var shouldScanForUnconfiguredDevices: Bool = false

  /**
   * Connection info maps for easy lookups.
   */
  private var connectionsById = [Int: Connection]()
  // TODO: can we fold these into one by using Identifier?
  private var connectionsByCentral = [CBCentral: Connection]()
  private var connectionsByPeripheral = [CBPeripheral: Connection]()

  public init(regionMonitor: RegionMonitor) {
    log.debug("BLESocketPeripheral()")

    self.regionMonitor = regionMonitor
    self.socketManager = BLESocketManager.getOrCreateInstance()
    self.queue = self.socketManager.methodQueue

    self.centralManager = CBCentralManager(delegate: nil, queue: self.queue)
    self.peripheralManager =
      CBPeripheralManager(delegate: nil, queue: self.queue)

    super.init()

    assert(BLESocketPeripheral.instance == nil,
           "Can't have more than one instance!")
    BLESocketPeripheral.instance = self

    BLESocketManager.setSocketPeripheral(self)

    self.centralManager.delegate = self
    self.peripheralManager.delegate = self

    // Add config service.
    self.services[BLESocketPeripheral.configServiceUuid] =
      ServiceInfo(service: Service(type: BLESocketPeripheral.configServiceUuid),
                  enabled: false)
  }

  public func updateSocketManager(socketManager: BLESocketManager) {
    self.socketManager = socketManager
  }

  /**
   * Called when JS adds new account uuids.
   */
  public func regionAdded(uuid: NSUUID) {
    if uuid == RegionMonitor.configBeaconUuid {
      return
    }

    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("regionAdded(\(serviceUuid))")

      assert(self.services[serviceUuid] == nil)

      let service = Service(type: serviceUuid)
      let serviceInfo = ServiceInfo(service: service, enabled: true)
      self.services[serviceUuid] = serviceInfo;

      if self.servicesAdded {
        log.info("Adding service \(serviceUuid)")
        self.peripheralManager.addService(service);
        serviceInfo.adding = true
      }

      self.updateScanningState()
    }
  }

  public func regionRemoved(uuid: NSUUID) {
    if uuid == RegionMonitor.configBeaconUuid {
      return
    }

    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("regionRemoved(\(serviceUuid))")

      assert(self.services[serviceUuid] != nil)

      self.removeAndCleanupService(serviceUuid)
      self.services[serviceUuid] = nil

      self.updateScanningState()
    }
  }

  public func regionEntered(uuid: NSUUID) {
    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("regionEntered(\(serviceUuid))")

      let serviceInfo = self.services[serviceUuid]!
      serviceInfo.inBeaconRange = true

      if serviceUuid == BLESocketPeripheral.configServiceUuid {
        if !self.unconfiguredDevicesInRange {
          self.unconfiguredDevicesInRange = true
          if self.enabled {
            log.info("Informing JS that there are unconfigured devices in " +
                     "range")
            self.socketManager.unconfiguredDevicesInRange(true)
          }
        }
      }

      self.updateScanningState()
    }
  }

  public func regionExited(uuid: NSUUID) {
    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("regionExited(\(serviceUuid))")

      let serviceInfo = self.services[serviceUuid]!
      serviceInfo.inBeaconRange = false

      if serviceUuid == BLESocketPeripheral.configServiceUuid {
        if self.unconfiguredDevicesInRange {
          self.unconfiguredDevicesInRange = false
          if self.enabled {
            log.info("Informing JS that no unconfigured devices are in range")
            self.socketManager.unconfiguredDevicesInRange(false)
          }
        }
      }

      self.updateScanningState()
    }
  }

  public func regionBeacons(uuid: NSUUID, deviceNumbers: Set<Int>) {
    dispatch_async(self.queue) {
      let serviceUuid = CBUUID(NSUUID: uuid)
      log.debug("regionBeacons(\(serviceUuid), \(deviceNumbers))")

      let serviceInfo = self.services[serviceUuid]!

      let foundDeviceNumbers =
        deviceNumbers.subtract(serviceInfo.deviceNumbersBeaconing)
      let lostDeviceNumbers =
        serviceInfo.deviceNumbersBeaconing.subtract(deviceNumbers)

      self.services[serviceUuid]!.deviceNumbersBeaconing = deviceNumbers

      for foundDeviceNumber in foundDeviceNumbers {
        self.socketManager.deviceBeaconing(serviceUuid.UUIDString,
                                           deviceNumber: foundDeviceNumber,
                                           beaconing: true)
      }
      for lostDeviceNumber in lostDeviceNumbers {
        self.socketManager.deviceBeaconing(serviceUuid.UUIDString,
                                           deviceNumber: lostDeviceNumber,
                                           beaconing: false)
      }

      self.updateScanningState()
    }
  }

  public func setForeground() {
    dispatch_async(self.queue) {
      log.debug("setForeground()")
      assert(!self.inForeground)
      self.inForeground = true

      let serviceInfo = self.services[BLESocketPeripheral.configServiceUuid]!
      serviceInfo.enabled = self.shouldScanForUnconfiguredDevices

      self.updateScanningState()
    }
  }

  public func setBackground() {
    dispatch_async(self.queue) {
      log.debug("setBackground()")
      assert(self.inForeground)
      self.inForeground = false

      let serviceInfo = self.services[BLESocketPeripheral.configServiceUuid]!
      serviceInfo.enabled = false

      self.updateScanningState()
    }
  }

  func setEnabled(enabled: Bool) {
    log.debug("setEnabled(\(enabled))")
    self.enabled = enabled

    if enabled {
      self.maybeAddServices()

      if self.unconfiguredDevicesInRange {
        log.info("Informing JS that there are unconfigured devices in range")
        self.socketManager.unconfiguredDevicesInRange(true)
      } else {
        log.info("Informing JS that no unconfigured devices are in range")
        self.socketManager.unconfiguredDevicesInRange(false)
      }
    } else {
      self.removeServices()
      self.unconfiguredDevicesInRange = false
    }

    self.updateScanningState()
  }

  func scanForUnconfiguredDevices(shouldScan: Bool) {
    log.debug("scanForUnconfiguredDevices(\(shouldScan))")

    self.shouldScanForUnconfiguredDevices = shouldScan

    let serviceInfo = self.services[BLESocketPeripheral.configServiceUuid]!
    serviceInfo.enabled = shouldScan && self.inForeground

    self.updateScanningState()
  }

  func scanForDevice(serviceUuid: String,
                     accountDeviceNumber: Int,
                     shouldScan: Bool) {
    log.debug("scanForDevice(\(serviceUuid), \(accountDeviceNumber), " +
              "\(shouldScan))")

    let uuid = CBUUID(string: serviceUuid)

    let serviceInfo = self.services[uuid]
    if serviceInfo === nil {
      log.error("Invalid serviceUuid: '\(serviceUuid)'")
      return
    }

    if shouldScan {
      serviceInfo!.deviceNumbersRequested.insert(accountDeviceNumber)
    } else {
      serviceInfo!.deviceNumbersRequested.remove(accountDeviceNumber)
    }
  }

  func send(connectionId: Int, data: NSData) {
    log.debug("send(\(connectionId), \(data.length))")

    assert(data.length != 0)

    if self.connectionsById[connectionId] == nil {
      log.error("Invalid connection id \(connectionId), ignoring")
      return
    }

    let connection = self.connectionsById[connectionId]!

    connection.outgoingQueue.append(data)

    if connection.currentOutgoingData == nil {
      self.sendOutgoingData(connection)
    }
  }

  func enableRssiUpdates(connectionId: Int, enable: Bool) {
    log.debug("enableRssiUpdates(\(connectionId), \(enable))")

    if self.connectionsById[connectionId] == nil {
      log.error("Invalid connection id \(connectionId), ignoring")
      return
    }

    let connection = self.connectionsById[connectionId]!
    if connection.rssiUpdatesEnabled == enable {
      return
    }

    connection.rssiUpdatesEnabled = enable
    if !enable {
      return
    }

    connection.peripheral.readRSSI()
  }

  func finish(connectionId: Int) {
    log.debug("finish(\(connectionId))")

    if self.connectionsById[connectionId] == nil {
      log.error("Invalid connection id \(connectionId), ignoring")
      return
    }

    let connection = self.connectionsById[connectionId]!
    assert(!connection.finished)
    connection.finished = true

    if connection.currentOutgoingData != nil {
      log.debug("Waiting for all outgoing data to be written before " +
                "unsubscribing")
      return
    }

    let peripheral = connection.peripheral
    let characteristic = connection.peripheralCharacteristic

    if !characteristic.isNotifying {
      log.debug("Not notifying")
      return
    }

    log.debug("Unsubscribing")
    peripheral.setNotifyValue(false, forCharacteristic: characteristic)
  }

  func disconnect(connectionId: Int) {
    log.debug("disconnect(\(connectionId))")

    if self.connectionsById[connectionId] == nil {
      log.error("Invalid connection id \(connectionId), ignoring")
      return
    }

    self.cleanupConnection(self.connectionsById[connectionId]!)
  }

  private func maybeAddServices() {
    log.debug("maybeAddServices() " +
              "peripheralState: \(self.peripheralManager.state.rawValue) " +
              "enabled: \(self.enabled) " +
              "servicesAdded: \(self.servicesAdded)")

    if self.servicesAdded ||
       self.peripheralManager.state != .PoweredOn ||
       !self.enabled {
      return
    }

    for (uuid, serviceInfo) in self.services {
      assert(!serviceInfo.adding)
      assert(!serviceInfo.added)

      log.info("Adding service \(uuid)")
      serviceInfo.adding = true

      self.peripheralManager.addService(serviceInfo.service)
    }

    self.servicesAdded = true
  }

  private func removeServices() {
    log.debug("removeServices()")

    if !self.servicesAdded {
      return
    }

    for serviceUuid in Array(self.services.keys) {
      self.removeAndCleanupService(serviceUuid)
    }

    self.servicesAdded = false
  }

  private func updateScanningState() {
    log.debug("updateScanningState() " +
              "centralState: \(self.centralManager.state.rawValue) " +
              "enabled: \(self.enabled) " +
              "inForeground: \(self.inForeground) " +
              "scanning: \(self.scanning)")

    if self.centralManager.state != .PoweredOn || !self.enabled {
      self.stopScanning()

      if !self.connectionsById.isEmpty {
        for connection in Array(self.connectionsById.values) {
          self.cleanupConnection(connection)
        }
        assert(self.connectionsById.isEmpty)
      }

      return
    }

    var servicesToScan = [CBUUID]()

    for (uuid, serviceInfo) in self.services {
      if (serviceInfo.shouldScan) {
        servicesToScan.append(uuid)
      }
    }

    if servicesToScan.isEmpty {
      self.stopScanning()
      return
    }

    log.info("Scanning for services \(servicesToScan)")
    self.centralManager.scanForPeripheralsWithServices(servicesToScan,
                                                       options: nil)
    self.scanning = true
  }

  private func stopScanning() {
    log.debug("stopScanning(), scanning = \(self.scanning)")

    if !self.scanning {
      return
    }

    log.info("Stopping scan")
    self.scanning = false

    self.centralManager.stopScan()

    if !self.pendingPeripherals.isEmpty {
      for peripheral in self.pendingPeripherals {
        self.cancelPeripheralConnection(peripheral)
      }
      self.pendingPeripherals.removeAll()
    }
  }

  private func removeAndCleanupService(serviceUuid: CBUUID) {
    log.debug("removeAndCleanupService(\(serviceUuid))")

    if let serviceInfo = self.services[serviceUuid] {
      if serviceInfo.adding || serviceInfo.added {
        self.peripheralManager.removeService(serviceInfo.service)
        serviceInfo.adding = false
        serviceInfo.added = false
      }
    }

    var connectionsToCleanUp = [Connection]()

    for connection in self.connectionsById.values {
      if connection.peripheralServiceUuid == serviceUuid {
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
    let peripheral = connection.peripheral

    self.connectionsById[connection.id] = nil
    self.connectionsByPeripheral[peripheral] = nil

    if central != nil {
      self.connectionsByCentral[central!] = nil
    }

    if !connection.disconnected {
      let characteristic = connection.peripheralCharacteristic
      if characteristic.isNotifying {
        peripheral.setNotifyValue(false, forCharacteristic: characteristic)
      }
    }

    self.socketManager.disconnected(connection.id)

    self.centralManager.cancelPeripheralConnection(peripheral)
    self.updateScanningState()
  }

  private func sendOutgoingData(connection: Connection) {
    log.debug("sendOutgoingData(\(connection.id))")
    assert(connection.currentOutgoingData == nil)

    if connection.outgoingQueue.count == 0 {
      log.debug("All data written")
      if connection.finished {
        let peripheral = connection.peripheral
        let characteristic = connection.peripheralCharacteristic
        if characteristic.isNotifying {
          log.debug("Unsubscribing")
          peripheral.setNotifyValue(false, forCharacteristic: characteristic)
        }
      }
      return
    }

    self.collectOutgoingData(connection)
    assert(connection.currentOutgoingData != nil)

    let peripheral = connection.peripheral
    let chararacteristic = connection.peripheralCharacteristic
    let data = connection.currentOutgoingData!

    log.debug("Sending \(data.length) bytes")
    peripheral.writeValue(data,
                          forCharacteristic: chararacteristic,
                          type: .WithResponse)
  }

  private func collectOutgoingData(connection: Connection) {
    log.debug("collectOutgoingData(\(connection.id))")

    assert(connection.outgoingQueue.count != 0)
    assert(connection.currentOutgoingData == nil)

    // Build up a contiguous chunk of data to send.
    var chunksToSend = [NSData]()
    var chunksToSendLength = 0

    var outgoingIndex = 0
    while outgoingIndex < connection.outgoingQueue.count &&
          chunksToSendLength < BLESocketPeripheral.kMaxWriteBytes {
      let chunk = connection.outgoingQueue[outgoingIndex]

      let availableLength =
        BLESocketPeripheral.kMaxWriteBytes - chunksToSendLength
      assert(availableLength > 0)

      if chunk.length > availableLength {
        // If we can't fit all the data then slice it up for the next chunk.
        let chunkRange = NSRange(location: 0, length: availableLength)
        chunksToSend.append(chunk.subdataWithRange(chunkRange))

        let remainingRange = NSRange(location: availableLength,
                                     length: chunk.length - availableLength)
        connection.outgoingQueue[outgoingIndex] =
          chunk.subdataWithRange(remainingRange)

        chunksToSendLength += availableLength
        break
      }

      chunksToSend.append(chunk)
      chunksToSendLength += chunk.length
      outgoingIndex += 1
    }

    assert(chunksToSend.count != 0)
    assert(chunksToSendLength != 0)

    // Pull any completely consumed data out of the array.
    if outgoingIndex != 0 {
      if outgoingIndex == connection.outgoingQueue.count {
        connection.outgoingQueue.removeAll()
      } else {
        connection.outgoingQueue.removeFirst(outgoingIndex)
      }
    }

    if chunksToSend.count == 1 {
      connection.currentOutgoingData = chunksToSend[0]
    } else {
      let mutableData = NSMutableData(capacity: chunksToSendLength)!

      for chunk in chunksToSend {
        mutableData.appendData(chunk)
      }
      connection.currentOutgoingData = mutableData
    }

    assert(connection.currentOutgoingData!.length == chunksToSendLength)
  }

  private func cancelPeripheralConnection(peripheral: CBPeripheral) {
    peripheral.delegate = nil
    self.pendingPeripherals.remove(peripheral)
    self.centralManager.cancelPeripheralConnection(peripheral)
  }

  private func prepareConnection(characteristic: CBCharacteristic) {
    let service = characteristic.service
    let serviceUuid = service.UUID
    let peripheral = service.peripheral

    log.debug("prepareConnection() service = \(serviceUuid), " +
              "peripheral = \(peripheral.identifier.UUIDString)")

    assert(characteristic.UUID == Service.characteristicUuid)
    assert(characteristic.properties.contains(.Write))
    assert(characteristic.properties.contains(.Notify))
    assert(peripheral.delegate === self)
    assert(self.enabled)
    assert(self.connectionsByPeripheral[peripheral] == nil)
    assert(self.services[serviceUuid] != nil)

    let serviceInfo = self.services[serviceUuid]!
    assert(serviceInfo.shouldScan)

    let connection = Connection(characteristic: characteristic)
    self.connectionsById[connection.id] = connection
    self.connectionsByPeripheral[peripheral] = connection

    self.pendingPeripherals.remove(peripheral)

    if !serviceInfo.added {
      // |startConnection| will be called after the service is added.
      assert(serviceInfo.adding)
      return
    }

    self.startConnection(connection)
  }

  private func startConnection(connection: Connection) {
    let characteristic = connection.peripheralCharacteristic
    let serviceUuid = connection.peripheralServiceUuid
    let peripheral = connection.peripheral

    log.debug("startConnection() service = \(serviceUuid), " +
              "peripheral = \(peripheral.identifier.UUIDString)")

    assert(peripheral.delegate === self)
    assert(self.enabled)

    peripheral.setNotifyValue(true, forCharacteristic: characteristic)
  }

  private static func parseManufacturerData(rawData: NSData) -> ManufacturerData? {
    log.debug("parseManufacturerData(\(rawData))")

    var data =
      Array(UnsafeBufferPointer(start: UnsafePointer<UInt8>(rawData.bytes),
                                count: rawData.length))
    if data.count < 3 {
      log.debug("Bad data length \(data.count)")
      return nil
    }

    let manufacturer = Int(UInt16(data[0]) + UInt16(UInt16(data[1]) << 8))
    if manufacturer != BLESocketPeripheral.kAdvertisingManufacturerCode {
      log.debug("Unknown manufacturer")
      return nil
    }

    let version = data[2]

    data.removeFirst(2)

    switch version {
      case 1:
        return self.parseManufacturerDataV1(data)
      default:
        log.debug("Unknown version \(version)")
        return nil
    }
  }

  private static func parseManufacturerDataV1(data: Array<UInt8>) -> ManufacturerDataV1? {
    log.debug("parseManufacturerDataV1(\(data))")

    if data.count != 5 {
      log.debug("Invalid length \(data.count)")
      return nil
    }

    var index: Int = 0

    let version = data[index]
    index += 1

    assert(version == 1)

    var deviceType = UInt16(data[index])
    index += 1
    deviceType += UInt16(UInt16(data[index]) << 8)
    index += 1

    var deviceNumber = UInt16(data[index])
    index += 1
    deviceNumber += UInt16(UInt16(data[index]) << 8)
    index += 1

    assert(index == data.count)

    return ManufacturerDataV1(version: version,
                              deviceType: deviceType,
                              deviceNumber: deviceNumber)
  }

  public func centralManagerDidUpdateState(central: CBCentralManager) {
    log.info("centralManagerDidUpdateState \(central.state.rawValue)")
    assert(central === self.centralManager)

    self.updateScanningState()
  }

  public func centralManager(central: CBCentralManager,
                             didDiscoverPeripheral peripheral: CBPeripheral,
                             advertisementData: [String : AnyObject],
                             RSSI: NSNumber) {
    log.debug("centralManager:didDiscoverPeripheral " +
              "\(peripheral.identifier.UUIDString), " +
              "\(peripheral.state.rawValue)")
    assert(central === self.centralManager)

    if !self.enabled {
      log.debug("No longer enabled")
      return
    }

    if peripheral.state != .Disconnected {
      log.debug("Peripheral state is \(peripheral.state.rawValue)")
      return
    }

    let manufacturerData =
      advertisementData[CBAdvertisementDataManufacturerDataKey] as? NSData
    if manufacturerData == nil {
      log.debug("No manufacturer data advertised")
      return
    }

    let parsedManufacturerData =
      BLESocketPeripheral.parseManufacturerData(manufacturerData!)
    if parsedManufacturerData == nil {
      log.debug("Failed to parse manufacturer data: \(manufacturerData!)")
      return
    }

    let deviceNumber = parsedManufacturerData!.deviceNumber
    if deviceNumber == nil {
      log.debug("No device number advertised")
      return
    }

    let serviceUuids =
      advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]

    if serviceUuids == nil || serviceUuids!.isEmpty {
      log.debug("No serivces advertised")
      return
    }

    var shouldConnect = false

    for serviceUuid in serviceUuids! {
      let serviceInfo = self.services[serviceUuid]
      if serviceInfo == nil || !serviceInfo!.enabled {
        continue
      }

      if serviceUuid == BLESocketPeripheral.configServiceUuid {
        log.debug("Advertising the config service")
        shouldConnect = true
        break
      }

      if serviceInfo!.deviceNumbersBeaconing.contains(deviceNumber!) {
        log.debug("Device number \(deviceNumber!) is beaconing")
        shouldConnect = true
        break
      }

      if serviceInfo!.deviceNumbersRequested.contains(deviceNumber!) {
        log.debug("Connection requested to device number \(deviceNumber!)")
        shouldConnect = true
        break
      }
    }

    if !shouldConnect {
      log.debug("Not beaconing and connection not requested, ignoring")
      return
    }

    central.connectPeripheral(peripheral, options: nil)
    self.pendingPeripherals.insert(peripheral)
  }

  public func centralManager(central: CBCentralManager,
                             didConnectPeripheral peripheral: CBPeripheral) {
    log.debug("centralManager:didConnectPeripheral " +
              "\(peripheral.identifier.UUIDString)")
    assert(central === self.centralManager)
    assert(peripheral.state == .Connected)

    if !self.enabled {
      self.cancelPeripheralConnection(peripheral)
      return
    }

    let services = Array(self.services.keys)
    log.debug("Discovering services \(services)")

    peripheral.delegate = self
    peripheral.discoverServices(services)
  }

  public func centralManager(central: CBCentralManager,
                             didFailToConnectPeripheral peripheral: CBPeripheral,
                             error: NSError?) {
    log.debug("centralManager:didFailToConnectPeripheral " +
              "\(peripheral.identifier.UUIDString) \(error)")
    assert(central === self.centralManager)
    assert(peripheral.delegate == nil)

    if error != nil {
      log.error("Failed to connect peripheral " +
                "\(peripheral.identifier.UUIDString) with error \(error!)")
    }

    if !self.enabled {
      self.cancelPeripheralConnection(peripheral)
      return
    }

    central.connectPeripheral(peripheral, options: nil)
  }

  public func centralManager(central: CBCentralManager,
                             didDisconnectPeripheral peripheral: CBPeripheral,
                             error: NSError?) {
    log.debug("centralManager:didDisconnectPeripheral " +
              "\(peripheral.identifier.UUIDString) \(error)")
    assert(central === self.centralManager)

    if error != nil {
      log.error("Peripheral \(peripheral.identifier.UUIDString) disconnected " +
                "with error \(error!)")
    }

    if let connection = self.connectionsByPeripheral[peripheral] {
      assert(!connection.disconnected)
      connection.disconnected = true

      self.cleanupConnection(connection)
    } else {
      self.cancelPeripheralConnection(peripheral)
    }
  }

  public func peripheralManagerDidUpdateState(peripheral: CBPeripheralManager) {
    log.debug("peripheralManagerDidUpdateState \(peripheral.state.rawValue)")
    assert(peripheral === self.peripheralManager)

    if peripheral.state != .PoweredOn && peripheral.state != .PoweredOff {
      self.removeServices()
      return
    }

    if peripheral.state != .PoweredOn {
      return
    }

    self.maybeAddServices()
  }

  public func peripheralManager(peripheral: CBPeripheralManager,
                                didAddService service: CBService,
                                error: NSError?) {
    log.debug("peripheralManager:didAddService \(service.UUID) \(error)")
    assert(peripheral === self.peripheralManager)

    if self.services[service.UUID] == nil {
      log.debug("Service must have been removed")
      return
    }

    assert(self.enabled)

    let serviceInfo = self.services[service.UUID]!
    assert(!serviceInfo.added)

    if !serviceInfo.adding {
      log.debug("Service must have been cleaned up")
      return
    }

    serviceInfo.adding = false

    if error != nil {
      log.error("Failed to add service \(service.UUID): \(error!)")
      self.removeAndCleanupService(service.UUID)
      return
    }

    serviceInfo.added = true

    for connection in self.connectionsById.values {
      if connection.peripheralServiceUuid == service.UUID {
        self.startConnection(connection)
      }
    }
  }

  public func peripheralManager(peripheral: CBPeripheralManager,
                                central: CBCentral,
                                didSubscribeToCharacteristic
                                characteristic: CBCharacteristic) {
    log.debug("peripheralManager:didSubscribeToCharacteristic() " +
              "\(central.identifier.UUIDString)")
    assert(peripheral === self.peripheralManager)

    if characteristic.UUID != Service.characteristicUuid {
      log.debug("Not our characteristic")
      return
    }

    if self.connectionsByCentral[central] != nil {
      log.debug("Central attempted to subscribe more than once")
      return
    }

    let identifiers = [central.identifier]
    let peripherals =
      self.centralManager.retrievePeripheralsWithIdentifiers(identifiers)
    assert(peripherals.count >= 1, "Central not available as peripheral")

    var centralAsPeripheral: CBPeripheral?
    for peripheral in peripherals {
      if peripheral.state == .Connected {
        centralAsPeripheral = peripheral
        break
      }
    }

    if centralAsPeripheral == nil {
      log.error("No connected peripherals match this central")
      return
    }

    let serviceInfo = self.services[characteristic.service.UUID]

    if !self.enabled ||
       serviceInfo == nil ||
       !serviceInfo!.shouldScan {
      self.cancelPeripheralConnection(centralAsPeripheral!)
      return
    }

    if characteristic.service !== serviceInfo!.service {
      log.error("Service instances are different")
      self.cancelPeripheralConnection(centralAsPeripheral!)
      return
    }

    assert(self.connectionsByPeripheral[centralAsPeripheral!] != nil)

    let connection = self.connectionsByPeripheral[centralAsPeripheral!]!
    assert(connection.central == nil)
    connection.central = central

    self.connectionsByCentral[central] = connection

    self.socketManager.connect(connection.id)
  }

  public func peripheralManager(peripheral: CBPeripheralManager,
                                central: CBCentral,
                                didUnsubscribeFromCharacteristic
                                characteristic: CBCharacteristic) {
    log.debug("peripheralManager:didUnsubscribeFromCharacteristic() " +
              "\(central.identifier.UUIDString)")
    assert(peripheral === self.peripheralManager)

    if characteristic.UUID != Service.characteristicUuid {
      log.debug("Not our characteristic")
      return
    }

    if self.connectionsByCentral[central] == nil {
      log.debug("Central attempted to unsubscribe more than once")
      return
    }

    let connection = self.connectionsByCentral[central]!

    assert(connection.central! === central)
    connection.central = nil

    self.connectionsByCentral[central] = nil

    self.socketManager.end(connection.id)
  }

  public func peripheralManager(peripheral: CBPeripheralManager,
                                didReceiveReadRequest request: CBATTRequest) {
    log.error("Received read request \(request.characteristic.UUID)")
    assert(peripheral === self.peripheralManager)
    peripheral.respondToRequest(request, withResult: .ReadNotPermitted)
  }

  public func peripheralManager(peripheral: CBPeripheralManager,
                                didReceiveWriteRequests requests: [CBATTRequest]) {
    assert(peripheral === self.peripheralManager)

    // If any request fails then we are supposed to pretend like all of them
    // failed, so modifications to our data are held on the stack until we know
    // that all requests succeeded.
    var pendingData = [Connection: NSMutableData]()

    for request in requests {
      if request.characteristic.UUID != Service.characteristicUuid {
        log.debug("Received write request for unsupported characteristic " +
                  "\(request.characteristic.UUID)")
        peripheral.respondToRequest(request, withResult: .WriteNotPermitted)
        return
      }

      if self.services[request.characteristic.service.UUID] == nil {
        log.debug("Received write request for unsupported service " +
                  "\(request.characteristic.service.UUID)")
        peripheral.respondToRequest(request, withResult: .WriteNotPermitted)
        return
      }

      let connection = self.connectionsByCentral[request.central]
      if connection == nil {
        log.debug("Received write request when not subscribed")
        peripheral.respondToRequest(request, withResult: .WriteNotPermitted)
        return
      }

      if connection!.central !== request.central {
        log.debug("Received write request from a different central")
        peripheral.respondToRequest(request, withResult: .WriteNotPermitted)
        return
      }

      let data = pendingData[connection!]
      if data == nil {
        pendingData[connection!] = NSMutableData(data: request.value!)
      } else {
        data!.appendData(request.value!)
      }
    }

    // All requests succeeded.
    peripheral.respondToRequest(requests[0], withResult: .Success)

    // Send the incoming data to JS.
    for (connection, data) in pendingData {
      self.socketManager.receive(connection.id, data: data)
    }
  }

  public func peripheral(peripheral: CBPeripheral,
                         didReadRSSI RSSI: NSNumber,
                         error: NSError?) {
    log.debug("peripheral:didReadRSSI(\(peripheral.identifier.UUIDString), " +
              "\(RSSI), \(error))")

    if error != nil {
      log.error("Failed to update rssi for peripheral " +
                "\(peripheral.identifier.UUIDString) with error \(error!)")
    }

    if self.connectionsByPeripheral[peripheral] == nil {
      log.debug("Peripheral already disconnected")
      return
    }

    let connection = self.connectionsByPeripheral[peripheral]!
    if !connection.rssiUpdatesEnabled {
      return
    }

    if error == nil {
      self.socketManager.rssiUpdate(connection.id, rssi: RSSI.integerValue)
    }

    peripheral.readRSSI()
  }

  public func peripheral(peripheral: CBPeripheral,
                         didDiscoverServices error: NSError?) {
    log.debug("peripheral:didDiscoverServices(" +
              "\(peripheral.identifier.UUIDString), \(error))")
    assert(self.pendingPeripherals.contains(peripheral))

    if error != nil {
      log.error("Failed to discover services on peripheral " +
                "\(peripheral.identifier.UUIDString) with error \(error!)")
      self.cancelPeripheralConnection(peripheral)
      return
    }

    if !self.enabled {
      self.cancelPeripheralConnection(peripheral)
      return
    }

    if peripheral.services == nil || peripheral.services!.count == 0 {
      log.debug("No services discovered")
      self.cancelPeripheralConnection(peripheral)
      return
    }

    // Favor the first available service that isn't the config service.
    var service: CBService?
    for discoveredService in peripheral.services! {
      let serviceUuid = discoveredService.UUID
      assert(self.services[serviceUuid] != nil)

      if self.services[serviceUuid]!.shouldScan {
        service = discoveredService
        if serviceUuid != BLESocketPeripheral.configServiceUuid {
          break
        }
      }
    }

    if service == nil {
      log.debug("No discovered services are still available")
      self.cancelPeripheralConnection(peripheral)
      return
    }

    log.debug("Discovering characteristics for service \(service!.UUID)")
    peripheral.discoverCharacteristics([Service.characteristicUuid],
                                       forService: service!)
  }

  public func peripheral(peripheral: CBPeripheral,
                         didDiscoverCharacteristicsForService service: CBService,
                         error: NSError?) {
    log.debug("peripheral:didDiscoverCharacteristicsForService(" +
              "\(peripheral.identifier.UUIDString), \(service.UUID), " +
              "\(error))")
    assert(self.pendingPeripherals.contains(peripheral))

    if error != nil {
      log.error("Failed to discover characteristics on peripheral " +
                "\(peripheral.identifier.UUIDString) with error \(error!)")
      self.cancelPeripheralConnection(peripheral)
      return
    }

    if !self.enabled ||
       self.services[service.UUID] == nil ||
       !self.services[service.UUID]!.shouldScan {
      self.cancelPeripheralConnection(peripheral)
      return
    }

    if service.characteristics == nil || service.characteristics!.count == 0 {
      log.debug("No characteristics discovered")
      self.cancelPeripheralConnection(peripheral)
      return
    }

    for characteristic in service.characteristics! {
      if characteristic.UUID == Service.characteristicUuid &&
         characteristic.properties.contains(.Write) &&
         characteristic.properties.contains(.Notify) {
        self.prepareConnection(characteristic)
        return
      }
    }

    log.debug("No matching characteristics discovered")
    self.cancelPeripheralConnection(peripheral)
  }

  public func peripheral(peripheral: CBPeripheral,
                         didUpdateNotificationStateForCharacteristic
                         characteristic: CBCharacteristic,
                         error: NSError?) {
    let service = characteristic.service
    let peripheral = service.peripheral
    log.debug("peripheral:didUpdateNotificationStateForCharacteristic() " +
              "\(peripheral.identifier.UUIDString), \(service.UUID), " +
              "\(error))")

    if error != nil {
      log.error("Failed to set notify value, \(error!)")
      assert(self.connectionsByPeripheral[peripheral] != nil)
      self.cleanupConnection(self.connectionsByPeripheral[peripheral]!)
    }
  }

  public func peripheral(peripheral: CBPeripheral,
                         didWriteValueForCharacteristic
                         characteristic: CBCharacteristic,
                         error: NSError?) {
    let service = characteristic.service
    let peripheral = service.peripheral
    log.debug("peripheral:didWriteValueForCharacteristic() " +
              "\(peripheral.identifier.UUIDString), \(service.UUID), " +
              "\(error))")

    assert(self.connectionsByPeripheral[peripheral] != nil)
    let connection = self.connectionsByPeripheral[peripheral]!

    if error != nil {
      log.error("Failed to write value, \(error!)")
      self.cleanupConnection(connection)
    }

    assert(connection.currentOutgoingData != nil)
    connection.currentOutgoingData = nil

    self.sendOutgoingData(connection)
  }
}

private func ==(lhs: BLESocketPeripheral.Connection,
                rhs: BLESocketPeripheral.Connection) -> Bool {
  return lhs.hashValue == rhs.hashValue
}
