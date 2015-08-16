import UIKit
import AVFoundation

internal class GetAVAssetURLOperation : ConcurrentOperation {
  static let DESIRED_KEYS = ["duration"]

  var value: AVURLAsset?
  var loader: AVAssetResourceLoaderDelegate?
  var loaderQueue: dispatch_queue_t?

  let url: NSURL

  // Private reference to the asset before it has finished.
  private var asset: AVAsset?


  init(url: NSURL, loader: AVAssetResourceLoaderDelegate?, queue: dispatch_queue_t?) {
    self.url = url
    self.loader = loader
    self.loaderQueue = queue
    super.init()
  }

  convenience init(url: NSURL) {
    self.init(url: url, loader: nil, queue: nil)
  }

  /**
   * Begin fetching the AVAsset and keys defined by DESIRED_KEYS.
   */
  override func start() {
    if self.cancelled {
      return
    }

    let asset = AVURLAsset(URL: self.url, options: [:])

    if let loader = self.loader {
      asset.resourceLoader.setDelegate(self.loader, queue: self.loaderQueue)
    }

    asset.loadValuesAsynchronouslyForKeys(GetAVAssetURLOperation.DESIRED_KEYS) {
      [unowned self] in

      Assertion(
        {
          asset.duration.milliseconds() > 0
        },
        "Asset should fully load before firing event"
      )

      self.value = asset
      self.state = .Finished
    }

    self.state = .Executing
    self.asset = asset
  }

  override func cancel() {
    super.cancel()

    // Cancel the loading of the asset if we have not yet finished.
    if let asset = self.asset {
      asset.cancelLoading()
      self.state = .Finished
    }
  }
}

/**
Custom implementation of AVPlayerItem to keep track of some app specific details.
*/
internal class LiveVideoItem : AVPlayerItem {
  /**
  identifier for this item.
  */
  var id: String!

  /**
  identifier for the next item (useful for ensuring we playback in sane order).
  */
  var nextId: String!

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
   * Do not let all items in the AVPlayerQueue finish. 
   * The last one will pause this number of MS before it finishes.
   */
  static let LAST_ITEM_PAUSE = 25

  /**
  Time in milliseconds between dispatching onTimeChange events.
  */
  static let TIME_EVENT_INTERVAL = 100

  var loader: SocketIOAVAssetLoaderDelegate! = SocketIOAVAssetLoaderDelegate()
  var eventDispatcher: RCTEventDispatcher!

  var rate: NSNumber = 1.0 {
    didSet {
      self.setRate()
    }
  }

  let assetLoaderQueue = dispatch_queue_create("video assets", DISPATCH_QUEUE_CONCURRENT)
  let eventQueue = dispatch_queue_create("event queue", DISPATCH_QUEUE_SERIAL)

  var videoResourceQueue: NSOperationQueue?

  // The player manages all video assets and outputs the "layers" which we use to
  // display raw video...
  private var player: AVQueuePlayer!
  private var playerLayer: AVPlayerLayer!
  private var faceTimeObservers: [AnyObject] = []
  private var timeChangeObserver: AnyObject?
  private var itemPlayedToEndObserver: AnyObject?
  private var lastItemEndObserver: AnyObject?

  /**
   * Used to log out the duration of the last item pause.
   */
  private var lastItemPauseDate: NSDate?

  // This property is used to indicate changes in playing states from react-native but does not
  // actually indicate we _are_ playing just hints to the internals what to do.
  var willPlay = false {
    didSet {
      if (self.willPlay) {
        self.play()
      } else {
        self.pause()
      }
    }
  }

  var segments: [VideoSegment] = [] {
    willSet(newSegments) {
      self.reconcileSegmentChange(previous: self.segments, new: newSegments)
    }
  }

  /**
   * Indiates if we are actively playing video this is only true if the player 
   Indicates* is ready and video is running.
   */
  private var playing = false
  private var pendingPlay: PropertyObserverKey?

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

  /**
   * Gets or creates the underlying NSOperation queue we use to load video from urls.
   * We may reset the queue in the cases where we don't care about the pending operations
   * inside of it (such as in the case of seeking).
   */
  private func getOrCreateVideoQueue() -> NSOperationQueue  {
    AssertMainThread()

    if self.videoResourceQueue == nil {
      self.videoResourceQueue = NSOperationQueue()
      self.videoResourceQueue!.name = "Video URL resource loader"
      // NSOperation queue returned is serial.
      self.videoResourceQueue!.maxConcurrentOperationCount = 1
      // However we use a concurrent underlying queue so multiple NSOpreationQueues can exist.
      self.videoResourceQueue!.underlyingQueue = self.assetLoaderQueue
    }

    return self.videoResourceQueue!
  }

  /**
   * Video Segments are represented as an array of VideoSegment objects these are sent from JS
   * and indicate when we should buffer/replace/append particular media assets. Because of the
   * races between the main and JS thread we must be somewhat careful how we reconcile these.
   *
   * Some examples of how we reconcile state. To make this easier to read the values below are just
   * ids rather then the full objects.
   *
   * # No changes:
   *
   *   new: [1]
   *   old: [1]
   *   = ()
   *
   * # Append a new segment
   *   new: [1, 2]
   *   old: [1]
   *   = append([2])
   *
   * # Append a new segment with disjoint state
   *   new: [7]
   *   old: [6]
   *   = append([7])
   *
   * #  Replace state
   *   new: [100, 101]
   *   old: [90, 91]
   *   = replace([100, 101])
   */
  private func reconcileSegmentChange(#previous: [VideoSegment], new: [VideoSegment]) {
    AssertMainThread()
    // When new count is 0 empty out anything we may have seen before.
    if (new.count == 0) {
      self.replaceSegments([])
      return
    }

    var boundary = 0
    for prevValue in previous {
      // During seeking we may have previous which shares some with the new list but the
      // new list is shorter. Even though we could potentially optimize and assume the user
      // wants the same queued items (since they share previous tracks) we do what JS tells us
      // and instead reset the tracks.
      if boundary >= new.count {
        boundary = 0
        break
      }

      let newValue = new[boundary]

      // The previous value is before next value so do not move the bounary.
      if newValue.previousId == prevValue.id {
        continue
      }

      // The id of the previous and next match so move the boundary.
      if newValue.id == prevValue.id {
        boundary += 1
        continue
      }
    }

    // None of the previous segments match up with the new ones replace it.
    if boundary == 0 {
      self.replaceSegments(new)
      return
    }

    for (; boundary < new.count; boundary += 1) {
      self.appendVideoSegment(new[boundary])
    }
  }

  func replaceSegments(segments: [VideoSegment]) {
    self.pause()

    if self.player.items().count > 0 {
      self.player.removeAllItems()
    }

    // When we replace segments cancel all previous load requests.
    if let operations = self.videoResourceQueue {
      self.videoResourceQueue?.cancelAllOperations()
      self.videoResourceQueue = nil
    }

    NSLog("Replacing segments: \(segments.count)")
    for segment in segments {
      self.appendVideoSegment(segment)
    }
  }

  func setRate() {
    AssertMainThread()
    if self.playing {
      let rate = self.rate as Float
      if self.player.rate != rate {
        self.player.rate = rate
      }
    }
  }

  /**
   * Pause playback of the video.
   *
   * This method should only be called from the main thread.
   */
  func pause() {
    if (self.playing) {
      // If we are already playing a simple pause works...
      self.player.pause()
      self.playing = false
      // Note: we _could_ reset playback rate here but that would defeat the purpose of trying
      // to give JS as much control as possible.
    } else if (self.pendingPlay != nil) {
      // if we are waiting to play remove the callback.
      self.player.removeKeyPathObserver(self.pendingPlay!)
      self.pendingPlay = nil
    }
  }

  /**
   * Start playback of the video or wait until we can start playing and start it.
   *
   * This method should only be called from the main thread.
   */
  func play() {
    AssertMainThread()
    if self.player.currentItem == nil || self.playing {
      return
    }

    let item = self.player.currentItem as! LiveVideoItem
    // If the player is immediately ready then just start it up.
    if item.status == AVPlayerItemStatus.ReadyToPlay {
      self.playing = true
      self.pendingPlay = nil

      // Log out time we have been paused while buffering.
      if let lastItemPaused = self.lastItemPauseDate {
        let time = NSDate().timeIntervalSinceDate(lastItemPaused) * 1000
        self.lastItemPauseDate = nil
        NSLog("Resumed after last item pause: \(time) ms")
      }

      // Update playback rate.
      self.setRate()
      return
    }

    // Do not listen more then once for the player to become ready.
    if self.pendingPlay != nil {
      return
    }

    // If the player is not ready yet we must wait for it to be in a ready state.
    self.pendingPlay = item.observeKeyPath("status") {
      [unowned self]
      (kvo, _) in

      if item.status != AVPlayerItemStatus.ReadyToPlay {
        return
      }

      dispatch_async(dispatch_get_main_queue()) {
        // Call play again so we don't race to set self.playing = nil
        self.play()
        // We don't need this listener anymore once we have started listening...
        item.removeKeyPathObserver(kvo)
      }
    }
  }

  private func appendVideoSegment(segment: VideoSegment) {
    AssertMainThread()

    var operation: GetAVAssetURLOperation

    switch(segment.type) {
    case "url":
      operation = GetAVAssetURLOperation(url: segment.url!)
    case "data":
      operation = self.buildVideoDataOperation(segment)
    default:
      NSLog("Unknown segment type \(segment.type) this should be impossible!");
      return
    }

    let queue = self.getOrCreateVideoQueue()
    queue.addOperation(operation)

    // The ordering of the queue should ensure this always is called in the right order.
    operation.completionBlock = {
      [unowned self] in

      // This block will be invoked both when the operation was finished _and_ cancelled
      // so value is optional if it is not present then the operation was cancelled.
      if let value = operation.value {
        dispatch_async(dispatch_get_main_queue()) {
          self.append(value, segment: segment)
        }
      }
    }
  }

  /**
  Creates an operation capable of loading video media from NSData
  */
  private func buildVideoDataOperation(segment: VideoSegment) -> GetAVAssetURLOperation {
    Assertion({
        segment.data != nil
      },
      "Attmpted to use null data for segment: \(segment.id)"
    )

    // Consume segment data and ensure the container does not keep a reference to it.
    let data = segment.data!
    segment.data = nil

    let (_, url) = self.loader.add(data)
    return GetAVAssetURLOperation(url: url, loader: self.loader, queue: self.assetLoaderQueue)
  }

  private func clearLastItemObserver() {
    if let lastObserver: AnyObject = self.lastItemEndObserver {
      self.player.removeTimeObserver(lastObserver)
      self.lastItemEndObserver = nil
    }
  }

  private func setupLastItemObserver(item: LiveVideoItem) {
    self.clearLastItemObserver()
    let duration = item.duration.milliseconds()

    Assertion(
      {
        let isGreater = duration > LiveVideo.LAST_ITEM_PAUSE
        if !isGreater {
          println("item: \(item) meta: \(item.asset.metadata)")
        }
        return isGreater
      },
      "Duration is less than LAST_ITEM_PAUSE \(duration)"
    )

    let endObserveTime = NSValue(CMTime: CMTimeMake(
      Int64((duration) - LiveVideo.LAST_ITEM_PAUSE),
      Int32(1000)
    ))

    let endTimeObserver : AnyObject = self.player.addBoundaryTimeObserverForTimes(
      [endObserveTime],
      queue: dispatch_get_main_queue(),
      usingBlock: {
        let items = self.player.items()
        if items.count == 1 {
          self.lastItemPauseDate = NSDate()
          self.pause()
        }
      }
    )
    self.lastItemEndObserver = endTimeObserver
  }

  private func append(asset: AVAsset, segment: VideoSegment) {
    AssertMainThread()
    // Calculate the duration in milliseconds
    let duration = asset.duration.milliseconds()

    let item = LiveVideoItem(asset: asset)

    // Segment is a wrapper for the data values too so we don't just copy it over.
    item.start = segment.startUTC
    item.faces = segment.faces
    item.id = segment.id
    item.nextId = segment.nextId

    self.player.insertItem(item, afterItem: nil)

    // If we should be playing video start it with play()
    if (self.willPlay) {
      self.play()
    }
  }

  func sendSegmentEvent(type: String, item: LiveVideoItem) {
    let eventBody: Dictionary<String, AnyObject> = [
      "target": self.reactTag,
      "id": item.id
    ]
    self.eventDispatcher.sendInputEventWithName(type, body: eventBody)
  }

  func sendFaceEvent(item: LiveVideoItem, event: FaceEvent) {
    // It's important to remember this offset is relative to the current item not global playback.
    let eventBody: Dictionary<String, AnyObject> = [
      "target": self.reactTag,
      "rects": event.rects,
      "tag": event.tag
    ]
    self.eventDispatcher.sendInputEventWithName(
      "faces", body: eventBody
    )
  }

  func setupSegmentObserver(item: LiveVideoItem) {
    let center = NSNotificationCenter.defaultCenter()
    if let previousObserver: AnyObject = self.itemPlayedToEndObserver {
      center.removeObserver(previousObserver)
      self.itemPlayedToEndObserver = nil
    }

    // Send the start event as this is called only when we have begun listening to a new event.
    self.sendSegmentEvent("segmentStart", item: item)
    self.itemPlayedToEndObserver = center.addObserverForName(
      AVPlayerItemDidPlayToEndTimeNotification,
      object: item,
      queue: nil, // TODO: Use our own queue
      usingBlock: {
        (_) in
        self.sendSegmentEvent("segmentEnd", item: item)
        self.playing = false
        if (self.player.items().count > 0) {
          self.player.advanceToNextItem()
        }
      }
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
      let item = self.player.currentItem as? LiveVideoItem
      if item == nil {
        return
      }

      let asset = item!.asset
      let log = item!.accessLog()

      self.setupFaceObserver(item!)
      self.setupSegmentObserver(item!)
      self.setupLastItemObserver(item!)

      // When current item is set if we should be playing but are in a paused state start playback.
      if (self.willPlay) {
        // This is safe to call multiple times or if we are already playing.
        self.play()
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

  deinit {
    self.destroy()
  }

  func destroy() {
    let center = NSNotificationCenter.defaultCenter()

    // Ensure player has no observers anymore...
    self.player.removeAllKeyPathObservers()
    self.player.removeTimeObserver(self.timeChangeObserver)

    for observer in self.faceTimeObservers {
      self.player.removeTimeObserver(observer)
    }

    if let previousObserver: AnyObject = self.itemPlayedToEndObserver {
      center.removeObserver(previousObserver)
    }

    self.clearLastItemObserver()

    // Note: This is an intentional pattern to catch any subtle leaks these should
    // always be available unless something in our logic is broken or not cleaned up.
    self.itemPlayedToEndObserver = nil
    self.eventDispatcher = nil
    self.player = nil
    self.playerLayer = nil
    self.loader = nil
  }
}