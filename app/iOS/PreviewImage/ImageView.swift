import UIKit

class ImageView : UIImageView {
  var blob: Dictionary<String, AnyObject>? {
    didSet {
      if let blob = self.blob {
        self.renderImage(blob)
      } else {
        NSLog("ImageView: nil blob value set (ignoring)")
      }
    }
  }

  var bridge: RCTBridge!

  init(bridge: RCTBridge) {
    super.init(frame: CGRectZero)
    self.bridge = bridge
  }

  override init(frame: CGRect) {
    NOT_IMPLEMENTED()
    super.init(frame: frame)
  }

  required init?(coder aDecoder: NSCoder) {
    NOT_IMPLEMENTED()
    super.init(coder: aDecoder)
  }

  func renderImage(blob: Dictionary<String, AnyObject>) {
    AssertMainThread()
    let blobManager = bridge.moduleForClass(BlobManager) as! BlobManager
    let data = blobManager.resolveAndReleaseBlob(blob)
    if (data == nil) {
      NSLog("ImageView: could not resolve blob, ignoring")
      return
    }
    if let image = UIImage(data: data!) {
      self.image = image
    } else {
      NSLog("ImageView: Image could not be created for unknown reasons (ignoring).")
    }
  }
}