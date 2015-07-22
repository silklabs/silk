@objc(PreviewImageManager)
class PreviewImageManager:  RCTViewManager {

  override func view() -> UIView! {
    return PreviewImage()
  }
}