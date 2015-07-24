import UIKit

class PreviewImage : UIImageView {

  typealias Faces = [Dictionary<String, AnyObject>]

  let queue = dispatch_queue_create("previewimage", DISPATCH_QUEUE_CONCURRENT)

  var stream: String? {
    didSet {
      self.initializeSocketIO(self.stream!)
    }
  }

  var listener: SocketIOListener?
  func initializeSocketIO(stream: String) {
    let instance = AppSocketIO.sharedInstance
    self.listener = instance.aquireListener()

    instance.emit("join", [stream])

    self.listener!.on(stream) {
      [unowned self]
      (data, ack) in
      let type = data?[0]["contents"] as? String
      if type == "jpeg" {
        if let buffer = data?[0]["frame"] as? NSData {
          let faces = data?[0]["faces"] as? Faces
          self.renderImage(buffer, faces: faces)
        } else {
          println("No NSData frame sent!")
        }
      }
    }
  }

  func renderImage(data: NSData, faces: Faces?) {
    let image = UIImage(data: data)!
    self.image = self.drawImage(image, faces: faces)
  }

  func drawImage(image: UIImage, faces: Faces?) -> UIImage {
    // Don't bother drawing if we don't have faces...
    if faces == nil {
      return image
    }

    // Skip if faces is empty array
    let facesArray = faces!
    if facesArray.count == 0 {
      return image
    }

    // Create drawing context...
    UIGraphicsBeginImageContext(image.size)

    // Draw origianl image...
    image.drawAtPoint(CGPointZero)

    let fieldWidth = CGFloat(facesArray[0]["fieldWidth"] as! Float)
    let fieldHeight = CGFloat(facesArray[0]["fieldHeight"] as! Float)
    let context = UIGraphicsGetCurrentContext()

    // Scale the context to whatever the device was recording at.
    CGContextScaleCTM(context, self.bounds.width / fieldWidth, self.bounds.height / fieldHeight)

    for face in facesArray {
      let x = CGFloat(face["x"] as! Float)
      let y = CGFloat(face["y"] as! Float)
      let width = CGFloat(face["width"] as! Float)
      let height = CGFloat(face["height"] as! Float)

      // Draw lightblue rectangle over faces
      UIColor(
        hue: CGFloat(0.54),
        saturation: CGFloat(0.53),
        brightness: CGFloat(0.79),
        alpha: CGFloat(1.0)).setStroke()

      let rect = CGRectMake(x, y , width, height)
      CGContextSetLineWidth(context, 4)
      CGContextStrokeRect(context, rect)
    }

    let finalImage = UIGraphicsGetImageFromCurrentImageContext()
    // Free context...
    UIGraphicsEndImageContext()
    return finalImage
  }
}