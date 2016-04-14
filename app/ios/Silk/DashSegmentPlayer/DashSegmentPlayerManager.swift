@objc(DashSegmentPlayerManager)
class DashSegmentPlayerManager : RCTViewManager {

  override func view() -> UIView! {
    return DashSegmentPlayer(bridge: self.bridge!)
  }

  @objc func pause(reactTag: NSNumber) {
    self.bridge!.uiManager.addUIBlock() {
      (__unused: RCTUIManager!, viewRegistry: Dictionary<NSNumber, UIView>!) in
      if let view = viewRegistry?[reactTag] as? DashSegmentPlayer {
        view.pause()
      }
    }
  }

  @objc func play(reactTag: NSNumber) {
    self.bridge!.uiManager.addUIBlock() {
      (__unused: RCTUIManager!, viewRegistry: Dictionary<NSNumber, UIView>!) in
      if let view = viewRegistry?[reactTag] as? DashSegmentPlayer {
        view.play()
      }
    }
  }

  @objc func enqueue(reactTag: NSNumber, blob: Dictionary<String, AnyObject>) {
    self.bridge!.uiManager.addUIBlock() {
      (__unused: RCTUIManager!, viewRegistry: Dictionary<NSNumber, UIView>!) in
      if let view = viewRegistry?[reactTag] as? DashSegmentPlayer {
        view.enqueue(blob)
      }
    }
  }

}
