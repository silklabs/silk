import UIKit
import AVFoundation

/**
Custom implementation of AVPlayerItem to keep track of some app specific details.
*/
internal class LiveVideoItem : AVPlayerItem {
  /**
  When this video was taken.
  */
  var start: Int64!
  internal var faces: [FaceEvent] = []
}

/**
View for a AvQueuePlayer designed for "live" streaming of video (in small mp4 files).
*/
class LiveVideo : UIView {

  /**
  Time in milliseconds between dispatching onTimeChange events.
  */
  static let TIME_EVENT_INTERVAL = 100

  var loader: SocketIOAVAssetLoaderDelegate! = SocketIOAVAssetLoaderDelegate()
  var eventDispatcher: RCTEventDispatcher!

  let assetLoaderQueue = dispatch_queue_create("video assets", DISPATCH_QUEUE_CONCURRENT)
  let eventQueue = dispatch_queue_create("event queue", DISPATCH_QUEUE_SERIAL)


  // The player manages all video assets and outputs the "layers" which we use to
  // display raw video...
  private var player: AVQueuePlayer!
  private var playerLayer: AVPlayerLayer!
  private var faceTimeObservers: [AnyObject] = []
  private var timeChangeObserver: AnyObject?

  init(eventDispatcher: RCTEventDispatcher) {
    super.init(frame: CGRectZero)
    self.player = AVQueuePlayer()
    self.eventDispatcher = eventDispatcher
    self.playerLayer = AVPlayerLayer(player: self.player)
    self.playerLayer.frame = self.bounds
    self.layer.addSublayer(self.playerLayer)

    self.initObservers()
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
    // Ensure player has no observers anymore...
    self.player.removeAllKeyPathObservers()
    self.player.removeTimeObserver(self.timeChangeObserver)

    for observer in self.faceTimeObservers {
      self.player.removeTimeObserver(observer)
    }

    // Note: This is an intentional pattern to catch any subtle leaks these should
    // always be available unless something in our logic is broken or not cleaned up.
    self.eventDispatcher = nil
    self.player = nil
    self.playerLayer = nil
    self.loader = nil
  }

  deinit {
    self.destroy()
  }

  /**
  Add a segement to the AVPlayerQueue.
  
  This method must be called from the main thread.
  */
  func append(frame: NSData, when: NSNumber, faces: [FaceEvent]) {
    let utcTime = when.longLongValue
    let (_, url) = self.loader.add(frame)
    let asset = AVURLAsset(URL: url, options: [:])

    asset.resourceLoader.setDelegate(self.loader, queue: self.assetLoaderQueue)

    // Calculate the duration in milliseconds
    let duration = Int(Float(asset.duration.value) / Float(asset.duration.timescale) * 1000)

    let item = LiveVideoItem(asset: asset)
    item.start = utcTime
    item.faces = faces

    self.player.insertItem(item, afterItem: nil)
  }

  func sendFaceEvent(item: LiveVideoItem, event: FaceEvent) {
    // It's important to remember this offset is relative to the current item not global playback.
    let eventBody: Dictionary<String, AnyObject> = [
      "target": self.reactTag,
      "faces": event.faces
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

    for event in item.faces {
      let observerTime = NSValue(CMTime: CMTimeMake(
        // Times are in milliseconds so timescale is of 1000 (ms / 1000 = second)
        Int64((event.when) - item.start),
        Int32(1000)
      ))

      let handle: AnyObject = self.player.addBoundaryTimeObserverForTimes([observerTime], queue: self.eventQueue) {
        self.sendFaceEvent(item, event: event)
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
      "time":  NSNumber(longLong: currentTime)
    ]

    self.eventDispatcher.sendInputEventWithName(
      "timeChange", body: eventBody
    )
  }

  /**
  Handles dispatching onTimeChange events.
  */
  func setupTimeObserver() {
    let interval = CMTimeMake(Int64(LiveVideo.TIME_EVENT_INTERVAL), 1000)
    self.timeChangeObserver = self.player.addPeriodicTimeObserverForInterval(
      interval,
      queue: self.eventQueue
    ) {
      [unowned self]
      (_) in
      let item = self.player.currentItem
      if item == nil {
        return
      }

      let liveItem = item as! LiveVideoItem
      self.sendTimeChangeEvent(liveItem)
    }
  }

  func initObservers() {
    self.setupTimeObserver()
    self.player.observeKeyPath("currentItem") {
      [unowned self]
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


  override func removeFromSuperview() {
    super.removeFromSuperview()
  }

}