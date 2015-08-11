import UIKit

class ImageView : UIImageView {
  var blob: NSData? {
    didSet {
      self.renderImage(self.blob!)
    }
  }

  func renderImage(data: NSData) {
    AssertMainThread()
    self.image = UIImage(data: data)!
  }
}