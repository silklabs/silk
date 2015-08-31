
/**
NSData bridge utility manages state for NSData blobs which get passed to JS.

This class is thread safe.
*/
@objc(NSDataBridge)
public class NSDataBridge : NSObject {
  internal typealias JSONDict = Dictionary<String, AnyObject>
  static let sharedInstance = NSDataBridge()

  /**
  Helper method to make calling this from objective-c easier.
  */
  public class func store(blob: NSData) -> Dictionary<String, AnyObject> {
    return NSDataBridge.sharedInstance.store(blob)
  }

  /**
   * Release a blob by id and return it as specific offset if found.
   */
  public class func releaseWithOffset(id: String, offset: NSNumber) -> NSData? {
    if let data = self.release(id) {
      Assertion({ data.length > offset.integerValue }, "data offset < length")
      let range = NSMakeRange(offset.integerValue, data.length - offset.integerValue)
      return data.subdataWithRange(range)
    }
    return nil
  }

  /**
   * Helper method to make calling this from objective-c easier.
   */
  public class func release(id: String) -> NSData? {
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
      let length = blob.length

      self.blobs[id] = blob
      result["length"] = length
      result["id"] = id;
      result["__native_type"] = "NSData"

      // First byte read as uint8 this is mostly useful for socket.io.
      if length > 0 {
        // Work with a specific subset of the data so we don't mess up...
        let byte = blob.subdataWithRange(NSMakeRange(0, 1))
        // Convert the first byte to UInt8 (part of the socket.io spec.
        var number: UInt8 = 0
        byte.getBytes(&number, length: sizeof(UInt8))
        // Cast the UInt8 to NSNumber so it can be transfered to JS.
        result["firstByte"] = NSNumber(unsignedChar: number)
      }
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