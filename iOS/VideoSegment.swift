/**
 * Video Segments are a transport mechanism for sending the details
 * of a video segement to our video classes which convert them into
 * AVPlayerItem subclasses that are intended to be short lived.
*/
@objc(VideoSegment)
class VideoSegment {

  /**
   * Convert an AnyObject type into VideoSegment this is intended to be
   * called by a RCTConvert category. Because of it's intended caller this method
   * makes use of more aggressive casting (JS should return the right values in all cases).
  */
  class func fromJSON(json: AnyObject) -> VideoSegment! {
    let dict = json as! Dictionary<String, AnyObject>
    let type = dict["type"] as! String
    let startUTC = (dict["startUTC"] as! NSNumber).longLongValue
    let endUTC = (dict["endUTC"] as! NSNumber).longLongValue

    // We may not always have faces so paper over that.
    let faces: [FaceEvent]
    if dict["faces"] != nil {
      faces = FaceEvent.fromJSONList(dict["faces"]!)
    } else {
      faces = []
    }

    let id = dict["id"] as! String
    let nextId = dict["nextId"] as? String
    let previousId = dict["previousId"] as? String

    if type == "url" {
      let url = NSURL(string: dict["url"] as! String)!
      return VideoSegment(
        url: url,
        id: id,
        nextId: nextId,
        previousId: previousId,
        startUTC: startUTC,
        endUTC: endUTC,
        faces: faces
      )
    }

    if type == "data" {
      let bridgedData = dict["data"] as! Dictionary<String, AnyObject>
      let data = NSDataBridge.release(bridgedData["id"] as! String)
      return VideoSegment(
        data: data,
        id: id,
        nextId: nextId,
        previousId: previousId,
        startUTC: startUTC,
        endUTC: endUTC,
        faces: faces
      )
    }

    // Either RCTConvert will catch this or we will crash horribly.
    let error = NSException(
      name: "Invalid type",
      reason: "VideoSegment type must be 'data' or 'url'",
      userInfo: ["type": type]
    )
    error.raise()

    // Return is unreachable but required to make swift typechecker happy.
    return nil
  }

  /**
  type of the video segement should be "url" or "data".
  */
  var type: String
  var url: NSURL?
  var data: NSData?
  var id: String
  var nextId: String?
  var previousId: String?

  /**
  UTC time when the video segment started value in milliseconds.
  */
  var startUTC: Int64

  /**
  UTC time when the video segment ended value in milliseconds.
  */
  var endUTC: Int64

  var faces: [FaceEvent]

  init(url: NSURL, id: String, nextId: String?, previousId: String?, startUTC: Int64, endUTC: Int64, faces: [FaceEvent]) {
    self.type = "url"
    self.id = id
    self.nextId = nextId
    self.previousId = previousId
    self.url = url
    self.startUTC = startUTC
    self.endUTC = endUTC
    self.faces = faces
  }

  init(data: NSData?, id: String, nextId: String?, previousId: String?, startUTC: Int64, endUTC: Int64, faces: [FaceEvent]) {
    self.type = "data"
    self.id = id
    self.nextId = nextId
    self.previousId = previousId
    self.data = data
    self.startUTC = startUTC
    self.endUTC = endUTC
    self.faces = faces
  }
}