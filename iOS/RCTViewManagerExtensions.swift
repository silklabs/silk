private let AQUIRE_VIEW_MAX_RETRIES: Int = 5

extension RCTViewManager  {

  /**
  This method is _not_ threadsafe and relies on aquireView to dispatch to right queue.
  */
  internal func aquireViewWithRetries(retries: Int, reactTag: NSNumber, block: (UIView?) -> Void) {
    self.bridge.uiManager.addUIBlock() {
      [unowned self]
      (__unused: RCTUIManager!, viewRegistry: RCTSparseArray!) in
      let view = viewRegistry?[reactTag] as? UIView
      if retries > 0 && view == nil {
        self.aquireViewWithRetries(retries - 1, reactTag: reactTag, block: block)
      } else {
        block(view)
      }
    }
  }

  /**
  Aquire access to a view after the current queue is empty. (see docs for addUIBlock)
  
  This method is threadsafe.
  */
  func aquireView(reactTag: NSNumber, block: (UIView?) -> Void) {
    // Note: As of react 0.7 and greater there is a good chance if you just recently created the
    // view it will not be available in viewRegistry yet so we must retry the operation.
    let queue = self.bridge.uiManager.methodQueue
    dispatch_async(queue) {
      self.aquireViewWithRetries(AQUIRE_VIEW_MAX_RETRIES, reactTag: reactTag, block: block)
    }
  }

}