@objc(LiveVideoManager)
class LiveVideoManager:  RCTViewManager {

  @objc override func customDirectEventTypes() -> [NSObject : AnyObject]! {
    return [
      "faces": ["registrationName": "onFaces"]
    ]
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
    return LiveVideo(eventDispatcher: self.bridge.eventDispatcher)
  }
}