@objc(LiveVideoManager)
class LiveVideoManager:  RCTViewManager {
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