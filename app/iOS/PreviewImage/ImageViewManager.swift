@objc(ImageViewManager)
class ImageViewManager:  RCTViewManager {

  override func view() -> UIView! {
    return ImageView(bridge: self.bridge!)
  }
}