@objc(LiveVideoManager)
class LiveVideoManager:  RCTViewManager {

  @objc override func customDirectEventTypes() -> [NSObject : AnyObject]! {
    return [
      "faces": ["registrationName": "onFaces"],
      "timeChange": ["registrationName": "onTimeChange"]
    ]
  }

  @objc func append(reactTag: NSNumber, data: NSData, when: NSNumber, faces: AnyObject) {
    self.aquireView(reactTag) {
      view in
      if let currentView = view as? LiveVideo {
        let faceList = FaceEvent.fromJSONList(faces)
        currentView.append(data, when: when, faces: faceList)
      }
    }
  }

  override func view() -> UIView! {
    return LiveVideo(eventDispatcher: self.bridge.eventDispatcher)
  }
}