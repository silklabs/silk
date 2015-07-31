@objc(FaceEvent)
public class FaceEvent {
  var when: Int64
  var faces: [Dictionary<String, AnyObject>]

  public class func fromJSONList(json: AnyObject) -> [FaceEvent] {
    var result: [FaceEvent] = []
    if let list = json as? [Dictionary<String, AnyObject>] {
      for item in list {
        let when = item["when"] as! NSNumber
        let faces = item["faces"] as! [Dictionary<String, AnyObject>]

        result.append(FaceEvent(
          when: when.longLongValue,
          faces: faces
        ))
      }
    }
    return result;
  }

  init(when: Int64, faces: [Dictionary<String, AnyObject>]) {
    self.when = when
    self.faces = faces
  }
}