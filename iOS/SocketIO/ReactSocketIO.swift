import Foundation

internal typealias JSONObj = Dictionary<String, AnyObject>

@objc(ReactSocketIO)
class ReactSocketIO : NSObject {
  // We implictly recieve a bridge by being registered as an exported module.
  var bridge: RCTBridge!
  var listener = AppSocketIO.sharedInstance.aquireListener()

  // The JS side will implicitly get these messages even if there
  // is no active listener on that side...
  var events: Set<String> = Set(["connect", "disconnect", "error", "reconnect"])

  override init() {
    super.init()
    self.listener.onAny() {
      [unowned self]
      event in
      self.handleEvent(event)
    }
  }

  func handleEvent(event: SocketAnyEvent) {
    objSync(self) {
      // Only send events which we explicitly asked for...
      if !self.events.contains(event.event) {
        return
      }

      // XXX: We use the original socket.io name which may conflict if for reason
      // we used both.
      var body: JSONObj = [
        "name": event.event,
        "items": []
      ]

      if let items = event.items {
        body["items"] = TypeTransfer.convert(items)
      }

      self.bridge.eventDispatcher.sendDeviceEventWithName("socketEvent", body: body)
    }
  }

  @objc func addListener(event: String) {
    objSync(self) {
      self.events.insert(event)
    }
  }

  @objc func removeListener(event: String) {
    objSync(self) {
      self.events.remove(event)
    }
  }

  @objc func emit(event: String, items: [AnyObject]?) {
    let instance = AppSocketIO.sharedInstance
    instance.emit(event, items ?? [])
  }

  @objc func connect(host: String, config: Dictionary<String, AnyObject>?) {
    AppSocketIO.sharedInstance.connect(host, options: config)
  }

  @objc func disconnect() {
    AppSocketIO.sharedInstance.disconnect()
  }
}