import Foundation

@objc(ReactSocketIO)
class ReactSocketIO : NSObject {
  // We implictly recieve a bridge by being registered as an exported module.
  var bridge: RCTBridge!
  var listener = AppSocketIO.sharedInstance.aquireListener()

  override init() {
    super.init()
    self.listener.onAny() {
      [unowned self]
      event in
      self.handleEvent(event)
    }
  }

  func handleEvent(event: SocketAnyEvent) {
    // XXX: Hack to ensure we don't attempt to send binary data over...
    if event.event.hasPrefix("video-") && count(event.event) > 30 {
      return
    }

    // XXX: We use the original socket.io name which may conflict if for reason
    // we used both.
    var body: Dictionary<String, AnyObject> = [
      "name": event.event,
      "items": []
    ]

    if let items = event.items {
      body["items"] = items
    }

    self.bridge.eventDispatcher.sendDeviceEventWithName("socketEvent", body: body)
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