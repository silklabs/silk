
/**
NSData bridge utility manages state for NSData blobs which get passed to JS.

This class is thread safe.
*/
@objc(NSDataBridge)
public class NSDataBridge {
  internal typealias JSONDict = Dictionary<String, AnyObject>
  static let sharedInstance = NSDataBridge()

  /**
  Helper method to make calling this from objective-c easier.
  */
  @objc public class func store(blob: NSData) -> Dictionary<String, AnyObject> {
    return NSDataBridge.sharedInstance.store(blob)
  }

  /**
  Helper method to make calling this from objective-c easier.
  */
  @objc public class func release(id: String) -> NSData? {
    return NSDataBridge.sharedInstance.release(id)
  }

  var blobs: Dictionary<String, NSData> = [:]

  /**
  Store an object into the data bridge... This object will _never_ be released automatically
  so you must call release at some point.
  
  This method is threadsafe.
  */
  func store(blob: NSData) -> JSONDict {
    var result: JSONDict = [:]
    let id =  NSUUID().UUIDString
    objSync(self) {
      self.blobs[id] = blob
      result["id"] = id;
      result["type"] = "NSData"
    }
    return result
  }

  /**
  Attempt to find and release a value from the bridge. This will return the NSData and
  remove the strongly held reference to it.
  
  This method is threadsafe.
  */
  func release(id: String) -> NSData? {
    var result: NSData?
    objSync(self) {
      if self.blobs[id] != nil {
        result = self.blobs.removeValueForKey(id)
      }
    }
    return result
  }

}