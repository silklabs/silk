import UIKit

class PreviewImage : UIImageView {

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
          self.renderImage(buffer)
        } else {
          println("No NSData frame sent!")
        }
      }
    }
  }

  func renderImage(data: NSData) {
    dispatch_async(self.queue) {
      let image = UIImage(data: data)
      dispatch_sync(dispatch_get_main_queue()) {
        self.image = image
      }
    }
  }
}