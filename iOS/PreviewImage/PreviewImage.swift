import UIKit

class PreviewImage : UIImageView {
  var blob: NSData? {
    didSet {
      self.renderImage(self.blob!)
    }
  }

  func renderImage(data: NSData) {
    self.image = UIImage(data: data)!
  }
}