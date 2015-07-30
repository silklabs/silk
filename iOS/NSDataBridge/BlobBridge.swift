@objc(BlobBridge)
class BlobBridge: NSObject {
  @objc func release(id: String) {
    NSDataBridge.release(id)
  }
}
