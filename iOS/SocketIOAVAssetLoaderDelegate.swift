import AVFoundation

/**
Custom AVFoundation asset loader (loads from memory)
*/

public final class SocketIOAVAssetLoaderDelegate: NSObject, AVAssetResourceLoaderDelegate {

  public static let SCHEME = "silkasset"

  private var data: [String: NSData] = [:]

  // Register a NSData instance and return its id and a NSURL which it can be fetched at.
  public func add(data: NSData) -> (id: String, url: NSURL) {
    objc_sync_enter(self)

    let id = NSUUID().UUIDString
    self.data[id] = data
    let url = NSURL(string: "\(SocketIOAVAssetLoaderDelegate.SCHEME)://\(id)")!
    objc_sync_exit(self)

    return (id, url)
  }

  /**
  Remove a reference to a NSData by its id after this is called attempting to fetch
  the object by its url will result in an error.
  */
  public func remove(id: String) -> Bool {
    objc_sync_enter(self)

    var removed = false
    let value = self.data.removeValueForKey(id)
    removed = value != nil

    // TODO: use defer once swift 2 is used.
    objc_sync_exit(self)

    return removed
  }

  public func resourceLoader(resourceLoader: AVAssetResourceLoader!,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest!) -> Bool {
      let url = loadingRequest.request.URL!
      let id = url.host!

      if let data = self.data[id] {
        // Note: unless we mutate the info request we can never correctly forfill the data side (unknown content length)
        if let infoRequest = loadingRequest.contentInformationRequest {
          // WTF? This is magic ios "UTI" which differs from the http video/mp4
          // You can find more of these here https://developer.apple.com/library/ios/documentation/Miscellaneous/Reference/UTIRef/Articles/System-DeclaredUniformTypeIdentifiers.html
          infoRequest.contentType = "public.mpeg-4"
          infoRequest.contentLength = Int64(data.length)
          infoRequest.byteRangeAccessSupported = true
        }

        // XXX: Expirement with non-data slicing solutions...
        if let request = loadingRequest.dataRequest {
          let part = data.subdataWithRange(NSRange(location: Int(request.requestedOffset), length: Int(request.requestedLength)))
          request.respondWithData(part)
          if request.requestedLength == data.length {
            self.remove(id)
          }
        }
        loadingRequest.finishLoading()
        return true
      }
      return false
  }


}