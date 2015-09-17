@objc(LiveVideoManager)
class LiveVideoManager:  RCTViewManager {

  @objc override func customDirectEventTypes() -> [AnyObject]! {
    return [
      "timeChange",
      "segmentError",
      "segmentEnd",
      "segmentStart",
    ]
  }

  @objc func pause(reactTag: NSNumber) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? LiveVideo {
        currentView.play()
      }
    }
  }

  @objc func play(reactTag: NSNumber) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? LiveVideo {
        currentView.play()
      }
    }
  }

  override func view() -> UIView! {
    return LiveVideo(eventDispatcher: self.bridge!.eventDispatcher)
  }
}