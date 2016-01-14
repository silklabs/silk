import Foundation

/**
 * NSData bridge utility manages state for NSData blobs which get passed to JS.
 *
 * This class is thread safe.
 */
@objc(SLKBlobManager)
public class BlobManager : NSObject, RCTBridgeModule, RCTURLRequestHandler {
  internal typealias JSONDict = Dictionary<String, AnyObject>

  var blobs: Dictionary<String, NSData> = [:]

  var _queue: NSOperationQueue?

  public func resolveAndReleaseBlob(blob: Dictionary<String, AnyObject>) -> NSData? {
    let blobID = blob["id"] as! String
    var blobOffset: NSNumber = 0
    if let offset = blob["offset"] as? NSNumber {
      blobOffset = offset
    }
    return self.releaseWithOffset(blobID, offset: blobOffset)
  }

  /**
   * Release a blob by id and return it as specific offset if found.
   */
  public func releaseWithOffset(id: String, offset: NSNumber) -> NSData? {
    if let data = self.release(id) {
      Assertion({ data.length > offset.integerValue }, message: "data offset < length")
      let range = NSMakeRange(offset.integerValue, data.length - offset.integerValue)
      return data.subdataWithRange(range)
    }
    return nil
  }

  /**
   * Store an object into the data bridge... This object will _never_ be
   * released automatically, so you must call release at some point.
   *
   * This method is threadsafe.
   */
  func store(blob: NSData) -> JSONDict {
    var result: JSONDict = [:]
    let id = NSUUID().UUIDString
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
   * Attempt to find and release a value from the bridge. This will return the
   * NSData and remove the strongly held reference to it.
   *
   * This method is threadsafe.
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

  // RCTBridgeModule

  public class func moduleName() -> String {
    return "BlobManager"
  }

  public func constantsToExport() -> [String: AnyObject] {
    return [:]
  }

  // RCTURLRequestHandler

  public func canHandleRequest(request: NSURLRequest!) -> Bool {
    return request.URL?.scheme == "silk-blob"
  }

  public func sendRequest(request: NSURLRequest!, withDelegate delegate: RCTURLRequestDelegate!) -> AnyObject! {
    if (_queue == nil) {
      _queue = NSOperationQueue()
    }

    weak var weakOp: NSBlockOperation? = nil
    let op = NSBlockOperation(block: {
      if let url = request.URL,
             components = NSURLComponents(URL: url, resolvingAgainstBaseURL: false),
             blobID = components.host {
        var offset: Int = 0
        if let queryItems = components.queryItems {
          for queryItem in queryItems {
            if queryItem.name == "offset" {
              if let value = queryItem.value {
                offset = Int(value) ?? 0
              }
            }
          }
        }
        if let data = self.releaseWithOffset(blobID, offset: offset) {
          let response = NSURLResponse(
            URL: url,
            MIMEType: nil,
            expectedContentLength: data.length,
            textEncodingName: nil
          )
          delegate.URLRequest(weakOp, didReceiveResponse: response)
          delegate.URLRequest(weakOp, didReceiveData: data)
          delegate.URLRequest(weakOp, didCompleteWithError: nil)
          return
        }
      }
      let error = NSError(domain: NSURLErrorDomain, code: NSURLErrorBadURL, userInfo: nil)
      delegate.URLRequest(weakOp, didCompleteWithError: error)
    })
    weakOp = op
    _queue!.addOperation(op)
    return weakOp
  }

  public func cancelRequest(requestToken: AnyObject!) {
    let op = requestToken as? NSOperation
    op?.cancel()
  }

}