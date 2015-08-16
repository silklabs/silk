import UIKit

class ImageView : UIImageView {
  var blob: NSData? {
    didSet {
      if let blob = self.blob {
        self.renderImage(blob)
      } else {
        NSLog("ImageView: nil blob value set (ignoring)")
      }
    }
  }

  func renderImage(data: NSData) {
    AssertMainThread()
    if let image =  UIImage(data: data) {
      self.image = image
    } else {
      NSLog("ImageView: Image could not be created for unknown reasons (ignoring).")
    }
  }
}