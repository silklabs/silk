@objc(OverlayModalManager)
class OverlayModalManager: RCTViewManager {

  override func view() -> UIView! {
    return OverlayModal(bridge: self.bridge!)
  }

  @objc func show(reactTag: NSNumber, callback: RCTResponseSenderBlock) {
    self.bridge!.uiManager.addUIBlock() {
      (__unused: RCTUIManager!, viewRegistry: Dictionary<NSNumber, UIView>!) in
      if let view = viewRegistry?[reactTag] as? OverlayModal {
        view.show(callback)
      }
    }
  }

  @objc func dismiss(reactTag: NSNumber, callback: RCTResponseSenderBlock) {
    self.bridge!.uiManager.addUIBlock() {
      (__unused: RCTUIManager!, viewRegistry: Dictionary<NSNumber, UIView>!) in
      if let view = viewRegistry?[reactTag] as? OverlayModal {
        view.dismiss(callback)
      }
    }
  }
}
