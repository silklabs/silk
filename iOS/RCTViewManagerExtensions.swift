extension RCTViewManager  {
  /**
  Aquire access to a view after the current queue is empty. (see docs for addUIBlock)
  */
  func aquireView(reactTag: NSNumber, block: (UIView?) -> Void) {

    self.bridge.uiManager.addUIBlock() {
      (__unused: RCTUIManager!, viewRegistry: RCTSparseArray!) in

      let view = viewRegistry?[reactTag] as? UIView
      block(view)
    }
  }

}