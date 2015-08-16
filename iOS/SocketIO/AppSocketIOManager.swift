/**
Manager for SocketIO usage:

We use socket.io extensiviely throughout the application and it is directly
tied to all import activities that we express... The default client is good
for basic operations but does not deal with things like maintaining a single
connection (performance) for the entire application or allowing removal
of specific event handlers based on their callback.
*/

import SocketIO

// Container to hold weakly held values in arrays
internal class ListenerContainer {
  weak var listener: SocketIOListener?
  init(_ listener: SocketIOListener) {
    self.listener = listener
  }
}

internal class OutgoingEvent {
  let event: String
  let items: [AnyObject]

  init(event: String, items: [AnyObject]) {
    self.event = event
    self.items = items
  }
}

internal class EventListenerCallback {
  let event: String
  let callback: NormalCallback

  init(event: String, callback: NormalCallback) {
    self.event = event
    self.callback = callback
  }
}

class SocketIOListener {
  var handlers: [EventListenerCallback] = []
  var onAnyHandler: ((SocketAnyEvent) -> Void)?

  func onAny(callback: ((SocketAnyEvent) -> Void)) {
    self.onAnyHandler = callback
  }

  func on(event: String, callback: NormalCallback) {
    objSync(self.handlers) {
      self.handlers.append(EventListenerCallback(event: event, callback: callback))
    }
  }

  func off(event: String) {
    objSync(self.handlers) {
      self.handlers = self.handlers.filter {$0.event == event ? false : true}
    }
  }

  func handleEvent(event: SocketAnyEvent) {
    objSync(self.handlers) {
      for handler in self.handlers {
        // The "*" star event handler is equal to the AnyEvent functionality.
        if handler.event == event.event {
          // XXX: Implement ack as needed...
          handler.callback(event.items, nil)
        }
      }

      if let anyHandler = self.onAnyHandler {
        anyHandler(event)
      }
    }
  }
}
/**
Emitting and listening to events is threadsafe while connect/disconnect
can be called on any thread they can race with each other if called in
this manner.
*/
class AppSocketIO {
  static let sharedInstance = AppSocketIO()

  private var client: SocketIOClient?
  private var listeners: [ListenerContainer] = []
  private var connected = false
  private var pendingEmits: [OutgoingEvent] = []

  /**
   * Custom queue to use instead of main thread when dispatching events.
   *
   * It's potentially important to use SERIAL here instead of CONCURRENT so dispatched events
   * occur in the order we receive them from the server.
   */
  private var dispatchQueue = dispatch_queue_create("app socket.io dispatch", DISPATCH_QUEUE_SERIAL)

  /**
  Returned listener is not strongly held by this instance and must have
  another strong reference to it for the duration you require it.

  This method is threadsafe.
  */
  func aquireListener() -> SocketIOListener {
    var listener: SocketIOListener?
    objSync(self.listeners) {
      listener = SocketIOListener()
      let item = ListenerContainer(listener!)
      self.listeners.append(item)
    }
    return listener!
  }

  func handleEvent(event: SocketAnyEvent) {
    objSync(self.listeners) {
      var removals: [Int] = []
      for (idx, container) in enumerate(self.listeners) {
        // This is the "magic" if we encounter an empty container we remove it from the list...
        if let listener = container.listener as SocketIOListener? {
          listener.handleEvent(event)
        } else {
          // XXX: This might be slow but it should happen infrequently...
          removals.append(idx)
        }
      }

      if removals.count > 0 {
        for idx in removals {
          self.listeners.removeAtIndex(idx)
        }
      }
    }
  }

  /*
  Emit an event to the server... If we are not yet connected or reconnecting this
  will buffer events until we can send them.

  This method is threadsafe.
  */
  func emit(event:String, _ items: [AnyObject]) {
    if self.connected {
      self.client!.emit(event, withItems: items)
      return
    }
    objSync(self.pendingEmits) {
      let event = OutgoingEvent(event: event, items: items)
      self.pendingEmits.append(event)
    }
  }

  private func onConnect() {
    self.connected = true
    if self.pendingEmits.count > 0 {
      objSync(self.pendingEmits) {
        for event in self.pendingEmits {
          self.emit(event.event, event.items)
        }
        self.pendingEmits = []
      }
    }
  }

  private func onDisconnect() {
    self.connected =  false
  }

  /**
  Disconnect from the socket.io server.. It is safe to call this multiple times even
  if there is no client.

  This method can be called from any thread but is not thread-safe.
  */
  func disconnect() {
    if let client = self.client {
      client.disconnect(fast: true)
      self.connected = false
      self.client = nil
    }
  }

  /**
  Connect to the given socket.io server.

  This method can be called from any thread but is not thread-safe.
  */
  func connect(socketURL: String, options: [String: AnyObject]?) {
    // Define here instead of a constant so we don't need to copy it later.
    var configuration: [String: AnyObject] = [
      "handleQueue": self.dispatchQueue
    ]

    if options != nil {
      for (key, value) in options! {
        configuration[key] = value
      }
    }

    // Disconnect if we had a previous client...
    self.disconnect()
    self.client = SocketIOClient(socketURL: socketURL, options: configuration)

    // Keep track of disconnections....
    self.client!.on("disconnect") {
      [unowned self]
      data in
      self.onDisconnect()
    }

    // And connections so we know
    self.client!.on("connect") {
      [unowned self]
      data in
      self.onConnect()
    }

    self.client!.onAny() {
      [unowned self]
      (event: SocketAnyEvent) in
      self.handleEvent(event)
    }

    // XXX: This is slow can we run it in another thread?
    self.client!.connect()
  }
}