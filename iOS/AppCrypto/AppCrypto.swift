import Security

@objc(AppCrypto)
public class AppCrypto : NSObject {

  public func getRandomBytes(length: NSNumber, callback: RCTResponseSenderBlock) {
    let data = NSMutableData(length: Int(length))!
    let result = SecRandomCopyBytes(kSecRandomDefault, Int(length), UnsafeMutablePointer<UInt8>(data.mutableBytes))

    Assertion({
      result == 0
    }, "Failed to create random bytes!")

    // We need to send back something JS can easily understand so we convert the bytes into UInt8
    var bytes: [NSNumber] = []
    var array = NSMutableArray()

    for (var i = 0; i < length.integerValue; i++) {
      let range = NSMakeRange(i, 1)
      var byte: UInt8 = 0
      data.getBytes(&byte, range: range)
      bytes.append(NSNumber(unsignedChar: byte))
    }

    callback([bytes])
  }

}