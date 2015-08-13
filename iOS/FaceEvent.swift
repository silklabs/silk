@objc(FaceEvent)
public class FaceEvent {
  var when: Int64
  var rects: [Dictionary<String, AnyObject>]
  var tag: String

  public class func fromJSONList(json: AnyObject) -> [FaceEvent] {
    var result: [FaceEvent] = []
    if let list = json as? [Dictionary<String, AnyObject>] {
      for item in list {
        let when = item["when"] as! NSNumber
        let rects = item["rects"] as! [Dictionary<String, AnyObject>]
        let tag = item["tag"] as! String;

        result.append(FaceEvent(
          when: when.longLongValue,
          tag: tag,
          rects: rects
        ))
      }
    }
    return result;
  }

  init(when: Int64, tag: String, rects: [Dictionary<String, AnyObject>]) {
    self.when = when
    self.rects = rects
    self.tag = tag
  }
}