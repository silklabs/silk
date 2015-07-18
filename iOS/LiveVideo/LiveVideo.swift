import UIKit
import AVFoundation


/**
View for a AvQueuePlayer designed for "live" streaming of video (in small mp4 files).
*/
class LiveVideo : UIView {

  var loader = SocketIOAVAssetLoaderDelegate()
  let queue = dispatch_queue_create("video assets", DISPATCH_QUEUE_CONCURRENT)

  // The player manages all video assets and outputs the "layers" which we use to
  // display raw video...
  var player = AVQueuePlayer()
  var playerLayer: AVPlayerLayer!
  var videoStream: NSDictionary = [:] {
    didSet {
      // XXX: This could implode in horrible app crashing ways
      let id = self.videoStream["id"] as! String
      let server = self.videoStream["server"] as! String

      self.initializeSocketIO(server: server, id: id)
    }
  }

  var socketIOClient: SocketIOClient?

  override init(frame: CGRect) {
    super.init(frame: frame)
    self.initializeLayer()
  }

  required init(coder aDecoder: NSCoder) {
    super.init(coder: aDecoder)
    self.initializeLayer()
  }

  // Ensure that the sublayer is inserted upon view creation... Note that we must
  // override both potential initializers and invoke this method to ensure it's
  // always called.
  func initializeLayer() {
    if (self.playerLayer == nil) {
      self.playerLayer = AVPlayerLayer(player: self.player)
      self.playerLayer.frame = self.bounds
      self.layer.addSublayer(self.playerLayer)
    }
  }

  func pause() {
    self.player.pause()
  }

  func play() {
    self.player.play()
  }

  func destroy() {
    if let client = self.socketIOClient {
      // Ensure player has no observers anymore...
      self.player.removeAllKeyPathObservers()

      client.disconnect(fast: true)
      self.socketIOClient = nil
    }
  }

  // Add video to queue from a url string
  func queueSegment(url: NSURL) {
    var asset = AVURLAsset(URL: url, options: [:])
    asset.resourceLoader.setDelegate(self.loader, queue: queue)

    let item = AVPlayerItem(asset: asset)
    self.player.insertItem(item, afterItem: nil)
  }

  func initializeSocketIO(#server: String, id: String) {
    self.socketIOClient = SocketIOClient(socketURL: server, options: [
      "log": false
    ])

    let stream = "video-\(id)"

    self.socketIOClient!.on("connect") {(data) in
      self.socketIOClient!.emit("join", stream)
    }

    self.socketIOClient!.on(stream) {
      [unowned self]
      (data, ack) in

      let type = data?[0]["contents"] as? String
      if type != "mp4" {
        return
      }

      if let frame: AnyObject = data?[0]["frame"] {
        let data = data?[0]["frame"] as! NSData
        let (_, url) = self.loader.add(data)
        self.queueSegment(url)
      }
    }

    self.socketIOClient!.connect()
    self.player.observeKeyPath("status") {
      [unowned self]
      (kvo, _) in
      if (self.player.status == AVPlayerStatus.ReadyToPlay) {
        dispatch_async(dispatch_get_main_queue()) {
          self.play()
          // We don't need this listener anymore once we have started listening...
          self.player.removeKeyPathObserver(kvo)
        }
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    self.playerLayer?.frame = self.bounds
  }

}