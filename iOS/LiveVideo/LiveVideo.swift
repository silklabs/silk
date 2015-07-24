import UIKit
import AVFoundation

internal typealias FaceData = Dictionary<String, AnyObject>
internal typealias Face = (utc: Int, json: FaceData)

/**
Custom implementation of AVPlayerItem to keep track of some app specific details.
*/
internal class LiveVideoItem : AVPlayerItem {
  /**
  When this video was taken.
  */
  var start: Int!
  internal var faces: [Face] = []
}

/**
View for a AvQueuePlayer designed for "live" streaming of video (in small mp4 files).
*/
class LiveVideo : UIView {

  /**
  Time in milliseconds between dispatching onTimeChange events.
  */
  static let TIME_EVENT_INTERVAL = 100

  var loader = SocketIOAVAssetLoaderDelegate()
  var eventDispatcher: RCTEventDispatcher!

  let assetLoaderQueue = dispatch_queue_create("video assets", DISPATCH_QUEUE_CONCURRENT)
  let eventQueue = dispatch_queue_create("event queue", DISPATCH_QUEUE_SERIAL)


  // Note: faces should only be interfaced with on the main thread.
  internal var faces: [Face] = []

  // The player manages all video assets and outputs the "layers" which we use to
  // display raw video...
  private var player = AVQueuePlayer()
  private var playerLayer: AVPlayerLayer!
  private var faceTimeObservers: [AnyObject] = []
  private var timeChangeObserver: AnyObject?

  var videoStream: String? {
    didSet {
      self.initializeSocketIO(self.videoStream!)
    }
  }

  var listener: SocketIOListener?

  init(eventDispatcher: RCTEventDispatcher) {
    super.init(frame: CGRectZero)
    self.eventDispatcher = eventDispatcher
    self.playerLayer = AVPlayerLayer(player: self.player)
    self.playerLayer.frame = self.bounds
    self.layer.addSublayer(self.playerLayer)
  }

  override init(frame: CGRect) {
    NOT_IMPLEMENTED()
    super.init(frame: frame)
  }

  required init(coder aDecoder: NSCoder) {
    NOT_IMPLEMENTED()
    super.init(coder: aDecoder)
  }

  func pause() {
    self.player.pause()
  }

  func play() {
    self.player.play()
  }

  func destroy() {
    if let client = self.listener {
      // Ensure player has no observers anymore...
      self.player.removeAllKeyPathObservers()

      let stream = "video-\(self.videoStream!)"
      let instance = AppSocketIO.sharedInstance
      instance.emit("leave", [stream])
      self.listener = nil
    }
  }

  /**
  Add a segement to the AVPlayerQueue.
  
  This method must be called from the main thread.
  */
  func queueSegment(asset: AVAsset, utcTime: Int) {
    // Calculate the duration in milliseconds
    let duration = Int(Float(asset.duration.value) / Float(asset.duration.timescale) * 1000)

    var faces: [Face] = []
    if self.faces.count > 0 {
      var sliceIdx = 0
      for face in self.faces {
        sliceIdx += 1

        // For whatever reason we have a face which does not correlate to any known
        // video fragement so just ignore it.
        if utcTime > face.utc {
          continue
        }

        // Face occurs somewhere in this asset.
        if face.utc >= utcTime && face.utc < utcTime + duration {
          faces.append(utc: face.utc, json: face.json)
          continue
        }

        // Face is somewhere past our asset...
        break
      }

      // Update faces list to only contain what we have not yet pushed into an item.
      self.faces.removeRange(Range(start: 0, end: sliceIdx))
    }


    let item = LiveVideoItem(asset: asset)
    item.start = utcTime
    item.faces = faces

    self.player.insertItem(item, afterItem: nil)
  }

  func sendFaceEvent(item: LiveVideoItem, face: Face) {
    // It's important to remember this offset is relative to the current item not global playback.
    let eventBody: Dictionary<String, AnyObject> = [
      "target": self.reactTag,
      "faces": face.json
    ]
    self.eventDispatcher.sendInputEventWithName(
      "faces", body: eventBody
    )
  }

  /**
  Configures observers to signal the JS thread when faces appear in the video.

  This method is only safe to call from the main thread.
  */
  func setupFaceObserver(item: LiveVideoItem) {
    // Remove any previous observers because timing is only local to individual items
    // any previous events would be wrong anyhow.
    if self.faceTimeObservers.count > 0 {
      // We remove all events when the current item changes rather then when specific events
      // are sent so seeking is handled without adding/removing extra observers.
      for observer in self.faceTimeObservers {
        self.player.removeTimeObserver(observer)
      }
      self.faceTimeObservers.removeAll()
    }

    // Only setup new observers if we have face data...
    if item.faces.count < 1 {
      return
    }

    for face in item.faces {
      let observerTime = NSValue(CMTime: CMTimeMake(
        // Times are in milliseconds so timescale is of 1000 (ms / 1000 = second)
        Int64((face.utc) - item.start),
        Int32(1000)
      ))

      let handle: AnyObject = self.player.addBoundaryTimeObserverForTimes([observerTime], queue: self.eventQueue) {
        self.sendFaceEvent(item, face: face)
      }

      self.faceTimeObservers.append(handle)
    }
  }

  /**
  Emit a time change event back to JS.
  */
  func sendTimeChangeEvent(item: LiveVideoItem) {
    let currentTime = item.start + item.currentTime().milliseconds()

    let eventBody: Dictionary<String, AnyObject> = [
      "target": self.reactTag,
      "time":  currentTime
    ]

    self.eventDispatcher.sendInputEventWithName(
      "timeChange", body: eventBody
    )
  }

  /**
  Handles dispatching onTimeChange events.
  */
  func setupTimeObserver(player: AVPlayer) {
    let interval = CMTimeMake(Int64(LiveVideo.TIME_EVENT_INTERVAL), 1000)
    self.timeChangeObserver = player.addPeriodicTimeObserverForInterval(
      interval,
      queue: self.eventQueue
    ) {
      (_) in
      let item = self.player.currentItem
      if item == nil {
        return
      }

      let liveItem = item as! LiveVideoItem
      self.sendTimeChangeEvent(liveItem)
    }
  }

  func initializeSocketIO(id: String) {
    let instance = AppSocketIO.sharedInstance
    self.listener = instance.aquireListener()

    let stream = "video-\(id)"
    instance.emit("join", [stream])

    self.listener!.on(stream) {
      [unowned self]
      (value, ack) in

      let data = value?[0] as! Dictionary<String, AnyObject>
      let type = data["contents"] as? String
      let when = data["when"] as! Int

      if type == "faces" {
        // Keep track of all the faces entries we receive we will later
        // associate them with a LiveVideoItem.
        self.faces.append(utc: when, json: data)
        return
      }

      if let frame = data["frame"] as? NSData {
        let (_, url) = self.loader.add(frame)
        let asset = AVURLAsset(URL: url, options: [:])
        asset.resourceLoader.setDelegate(self.loader, queue: self.assetLoaderQueue)

        asset.loadValuesAsynchronouslyForKeys(["readable"]) {
          dispatch_async(dispatch_get_main_queue()) {
            self.queueSegment(asset, utcTime: when)
          }
        }

      }
    }

    self.setupTimeObserver(self.player)

    self.player.observeKeyPath("currentItem") {
      (_) in
      let item = self.player.currentItem
      if item == nil {
        return
      }

      self.setupFaceObserver(item as! LiveVideoItem)
    }

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
    self.playerLayer.frame = self.bounds
  }


}