@objc(DashSegmentPlayerManager)
class DashSegmentPlayerManager : RCTViewManager {

  @objc func pause(reactTag: NSNumber) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? DashSegmentPlayer {
        currentView.pause()
      }
    }
  }

  @objc func play(reactTag: NSNumber) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? DashSegmentPlayer {
        currentView.play()
      }
    }
  }

  @objc func enqueue(reactTag: NSNumber, segment: VideoSegment) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? DashSegmentPlayer {
        currentView.enqueue(segment)
      }
    }
  }

  override func view() -> UIView! {
    return DashSegmentPlayer(bridge: self.bridge!)
  }
}
