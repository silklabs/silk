private let log = DebugLog.create("silk-BLESocketManager")

@objc(BLESocketManager)
public class BLESocketManager : NSObject, RCTBridgeModule {

  private static var instance: BLESocketManager? = nil
  private static var bleSocketPeripheral: BLESocketPeripheral? = nil
  private static var regionMonitor: RegionMonitor? = nil
  private static let mainQueue: dispatch_queue_t = dispatch_get_main_queue()

  internal class func setSocketPeripheral(peripheral: BLESocketPeripheral) {
    assert(BLESocketManager.bleSocketPeripheral == nil)
    BLESocketManager.bleSocketPeripheral = peripheral
  }

  internal class func setRegionMonitor(regionMonitor: RegionMonitor) {
    assert(BLESocketManager.regionMonitor == nil)
    BLESocketManager.regionMonitor = regionMonitor
  }

  internal class func getOrCreateInstance() -> BLESocketManager! {
    log.debug("getOrCreateInstance()")

    if BLESocketManager.instance != nil {
      log.debug("Returning previous instance")
      return BLESocketManager.instance
    }

    log.debug("Making new instance")

    let instance = BLESocketManager()
    assert(BLESocketManager.instance === instance)
    return instance
  }

  public let methodQueue: dispatch_queue_t

  // RCTBridgeModule
  public class func moduleName() -> String {
    return "BLESocketManager"
  }
  
  public func constantsToExport() -> [NSObject : AnyObject] {
    return [:]
  }
  
  public func batchDidComplete() {
  }

  private var _bridge: RCTBridge?
  public var bridge: RCTBridge? {
    get {
      return self._bridge
    }
    set {
      self._bridge = newValue
      if let bleSocketPeripheral = BLESocketManager.bleSocketPeripheral {
        bleSocketPeripheral.updateSocketManager(self)
      }
    }
  }

  override init() {
    log.debug("BLESocketManager()")

#if RCT_DEV
    if let previous = BLESocketManager.instance {
      // ReactNative reloads will cause us to create a new instance of this
      // class and that isn't something we expect to happen in the real world.
      // Clean up the old instance here and try to reuse the dispatch queue.
      BLESocketManager.instance = nil

      self.methodQueue = previous.methodQueue
    } else {
      self.methodQueue = dispatch_queue_create("com.silklabs.bluetooth", nil)
    }
#else
    self.methodQueue = dispatch_queue_create("com.silklabs.bluetooth", nil)
#endif

    super.init()

    assert(BLESocketManager.instance == nil)
    BLESocketManager.instance = self
  }

  internal func connect(id: Int) {
    log.debug("BLESocketManager.connect(\(id))")

    let name = "silk-blesocketmanager-connect"
    let body = ["id": id]
    self.bridge!.eventDispatcher.sendDeviceEventWithName(name, body: body)
  }

  internal func receive(id: Int, data: NSData!) {
    log.debug("receive(\(id))")

    let encodingOptions = NSDataBase64EncodingOptions(rawValue: 0)
    let dataBase64 = data.base64EncodedStringWithOptions(encodingOptions)

    let name = "silk-blesocketmanager-data"
    let body = ["id": id, "data": dataBase64]
    self.bridge!.eventDispatcher.sendDeviceEventWithName(name, body: body)
  }
  
  internal func rssiUpdate(id: Int, rssi: Int) {
    log.debug("rssiUpdate(\(id), \(rssi))")

    let name = "silk-blesocketmanager-rssi"
    let body = ["id": id, "rssi": rssi]
    self.bridge!.eventDispatcher.sendDeviceEventWithName(name, body: body)
  }

  internal func disconnect(id: Int) {
    log.debug("disconnect(\(id))")

    let name = "silk-blesocketmanager-disconnect"
    let body = ["id": id]
    self.bridge!.eventDispatcher.sendDeviceEventWithName(name, body: body)
  }

  func start() {
    log.debug("start()")

    BLESocketManager.bleSocketPeripheral!.setEnabled(true)
  }

  func stop() {
    log.debug("stop()")

    BLESocketManager.bleSocketPeripheral!.setEnabled(false)
  }

  func addBeaconUuid(beaconUuidString: NSString) {
    log.debug("addBeaconUuid('\(beaconUuidString)')")
    
    let beaconUuid = NSUUID(UUIDString: beaconUuidString as String)
    if beaconUuid == nil {
      log.error("Invalid uuid string: '\(beaconUuidString)'")
      return
    }

    if beaconUuid! == RegionMonitor.configBeaconUuid {
      log.error("Cannot add the config beacon uuid")
      return
    }

    dispatch_async(BLESocketManager.mainQueue) {
      BLESocketManager.regionMonitor!.startMonitoring(beaconUuid!)
    }
  }

  func removeBeaconUuid(beaconUuidString: NSString) {
    log.debug("removeBeaconUuid('\(beaconUuidString)')")

    let beaconUuid = NSUUID(UUIDString: beaconUuidString as String)
    if beaconUuid == nil {
      log.error("Invalid uuid string: '\(beaconUuidString)'")
      return
    }

    if beaconUuid! == RegionMonitor.configBeaconUuid {
      log.error("Cannot remove the config beacon uuid")
      return
    }

    dispatch_async(BLESocketManager.mainQueue) {
      BLESocketManager.regionMonitor!.stopMonitoring(beaconUuid!)
    }
  }

  func removeAllBeaconUuids() {
    log.debug("removeAllBeaconUuids()")

    dispatch_async(BLESocketManager.mainQueue) {
      BLESocketManager.regionMonitor!.reset()
    }
  }

  func send(id: NSInteger, dataBase64: NSString) {
    log.debug("send(\(id))")

    let decodingOptions = NSDataBase64DecodingOptions(rawValue: 0)
    let data = NSData(base64EncodedString: dataBase64 as String,
                      options: decodingOptions)

    BLESocketManager.bleSocketPeripheral!.send(id, data: data)
  }

  func updateRssi(id: NSInteger) {
    log.debug("updateRssi(\(id))")

    BLESocketManager.bleSocketPeripheral!.updateRssi(id)
  }
}