private let log = DebugLog.create("silk-blesocketmanager")

@objc(BLESocketManager)
public class BLESocketManager : NSObject, RCTBridgeModule {

  private static var instance: BLESocketManager? = nil
  internal class func setBeacon(beacon: HomeBeacon!) {
    assert(BLESocketManager.instance != nil)
    BLESocketManager.instance!.homeBeacon = beacon
  }

  internal class func getOrCreateInstance() -> BLESocketManager! {
    log.debug("BLESocketManager.getOrCreateInstance()")

    if BLESocketManager.instance != nil {
      log.debug("Returning previous instance")
      return BLESocketManager.instance
    }

    log.debug("Making new instance")

    let instance = BLESocketManager()
    assert(BLESocketManager.instance === instance)
    return instance
  }

  private var homeBeacon: HomeBeacon!
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
      if let beacon = self.homeBeacon {
        beacon.updateSocketManager(self)
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
      self.homeBeacon = previous.homeBeacon

      previous.homeBeacon = nil
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

  func send(id: NSInteger, dataBase64:NSString) {
    log.debug("BLESocketManager.send(\(id))")

    let decodingOptions = NSDataBase64DecodingOptions(rawValue: 0)
    let data = NSData(base64EncodedString: dataBase64 as String,
                      options: decodingOptions)

    self.homeBeacon.send(id, data: data)
  }

  func updateRssi(id: NSInteger) {
    log.debug("BLESocketManager.updateRssi(\(id))")

    self.homeBeacon.updateRssi(id)
  }

  internal func receive(id: Int, data: NSData!) {
    log.debug("BLESocketManager.receive(\(id))")

    let encodingOptions = NSDataBase64EncodingOptions(rawValue: 0)
    let dataBase64 = data.base64EncodedStringWithOptions(encodingOptions)

    let name = "silk-blesocketmanager-data"
    let body = ["id": id, "data": dataBase64]
    self.bridge!.eventDispatcher.sendDeviceEventWithName(name, body: body)
  }
  
  internal func rssiUpdate(id: Int, rssi: Int) {
    log.debug("BLESocketManager.rssiUpdate(\(id), \(rssi))")

    let name = "silk-blesocketmanager-rssi"
    let body = ["id": id, "rssi": rssi]
    self.bridge!.eventDispatcher.sendDeviceEventWithName(name, body: body)
  }

  internal func disconnect(id: Int) {
    log.debug("BLESocketManager.disconnect(\(id))")

    let name = "silk-blesocketmanager-disconnect"
    let body = ["id": id]
    self.bridge!.eventDispatcher.sendDeviceEventWithName(name, body: body)
  }
}