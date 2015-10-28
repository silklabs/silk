/**
 * Provides simple interface for creating async NSOperation classes.
 */
class ConcurrentOperation : NSOperation {

  /**
   * Async states defined by NSOperation
   */
  enum States {
    case Ready
    case Executing
    case Finished
  }

  /**
   * NSOperation relies on particular KVO events being sent we map those events
   * to particular states.
   */
  private func stateToEvent(state: States) -> String {
    switch (state) {
    case .Ready:
      return "isReady";
    case .Executing:
      return "isExecuting";
    case .Finished:
      return "isFinished";
    }
  }

  var state = States.Ready {
    willSet {
      willChangeValueForKey(self.stateToEvent(newValue))
      willChangeValueForKey(self.stateToEvent(self.state))
    }
    didSet {
      didChangeValueForKey(self.stateToEvent(oldValue))
      didChangeValueForKey(self.stateToEvent(self.state))
    }
  }

  override var asynchronous: Bool {
    return true
  }

  /**
   * Override executing will be invoked when isReady KVO is sent.
   */
  override var ready: Bool {
    return super.ready && state == States.Ready
  }

  /**
   * Override executing will be invoked when isExecuting KVO is sent.
   */
  override var executing: Bool {
    return state == States.Executing
  }

  /**
   * Override executing will be invoked when isFinished KVO is sent.
   */
  override var finished: Bool {
    return state == States.Finished
  }

}