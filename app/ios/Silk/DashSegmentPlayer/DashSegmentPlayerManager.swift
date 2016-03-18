private let log = DebugLog.create("silk-videoplayermgr")

@objc(DashSegmentPlayerManager)
class DashSegmentPlayerManager : RCTViewManager {

  @objc override func customDirectEventTypes() -> [String]! {
    return [
      "segmentEnd",
      "segmentEnqueued",
      "segmentError",
      "segmentStart",
      "timeChange",
    ]
  }

  @objc func pause(reactTag: NSNumber) {
    log.debug("pause(\(reactTag))")
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? DashSegmentPlayer {
        currentView.pause()
      }
    }
  }

  @objc func play(reactTag: NSNumber) {
    log.debug("play(\(reactTag))")
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? DashSegmentPlayer {
        currentView.play()
      }
    }
  }

  @objc func enqueue(reactTag: NSNumber, segment: VideoSegment) {
    log.debug("enqueue(\(reactTag), \(segment))")
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
