
@objc(LiveVideoManager)
class LiveVideoManager:  RCTViewManager {

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

  @objc func destroy(reactTag: NSNumber) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? LiveVideo {
        currentView.destroy()
      }
    }

  }

  override func view() -> UIView! {
    return LiveVideo()
  }

}