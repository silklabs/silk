@objc(OverlayModalManager)
class OverlayModalManager: RCTViewManager {

  override func view() -> UIView! {
    return OverlayModal(bridge: self.bridge!)
  }

  @objc func show(reactTag: NSNumber, callback: RCTResponseSenderBlock) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? OverlayModal {
        currentView.show(callback)
      } else {
        println("Warning: Could not get OverlayModal")
      }
    }
  }

  @objc func dismiss(reactTag: NSNumber, callback: RCTResponseSenderBlock) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? OverlayModal {
        currentView.dismiss(callback)
      } else {
        println("Warning: Could not get OverlayModal")
      }
    }
  }
}