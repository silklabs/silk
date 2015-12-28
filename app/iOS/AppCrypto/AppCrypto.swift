import Security

@objc(AppCrypto)
public class AppCrypto : NSObject {

  /**
   * Ensure we are not running our expensive crypto stuff on the main thread.
   */
  static let QUEUE = dispatch_queue_create("com.silklabs.appcrypto", nil)
  var methodQueue: dispatch_queue_t {
    return AppCrypto.QUEUE;
  }

  /**
   * A PBKDF2 KDF helper this will always use a SHA256 hash.
   */
  public func PBKDF2KeyDerivation(input: NSString, salt: NSString, rounds: NSNumber, callback: RCTResponseSenderBlock) {
    let derivedKey = NSMutableData(length: kCCKeySizeAES256)

    // Create Swift intermediates for clarity in function calls
    let algorithm = CCPBKDFAlgorithm(kCCPBKDF2)
    let randomAlgorithm = CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256)

    let saltPointer  = UnsafePointer<UInt8>(salt.cStringUsingEncoding(NSUTF8StringEncoding))
    let saltLength = size_t(salt.length)
    let inputPointer = UnsafePointer<Int8>(input.cStringUsingEncoding(NSUTF8StringEncoding))
    let inputLength  = size_t(input.lengthOfBytesUsingEncoding(NSUTF8StringEncoding))
    let derivedKeyPointer = UnsafeMutablePointer<UInt8>(derivedKey!.mutableBytes)
    let derivedKeyLength = size_t(derivedKey!.length)

    let kdfStatus = CCKeyDerivationPBKDF(
      algorithm,
      inputPointer,
      inputLength,
      saltPointer,
      saltLength,
      randomAlgorithm,
      rounds.unsignedIntValue,
      derivedKeyPointer,
      derivedKeyLength
    )

    Assertion({
      kdfStatus == 0
    }, message: "CCKeyDerivationPBKDF failed")

    callback([derivedKey!.hexString])
  }

  public func getRandomBytes(length: NSNumber, callback: RCTResponseSenderBlock) {
    let bytes = [UInt8](count: Int(length), repeatedValue: 0)
    let result = SecRandomCopyBytes(kSecRandomDefault, Int(length), UnsafeMutablePointer<UInt8>(bytes))

    Assertion({
      result == 0
    }, message: "Failed to create random bytes!")

    // [Uint8] is not automatically encoded to [NSNumber], while [Int] is.
    callback([bytes.map{ Int($0) }])
  }

}