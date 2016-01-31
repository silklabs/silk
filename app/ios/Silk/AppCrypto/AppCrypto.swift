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
  public func pbkdf2KeyDerivation(
    input: NSString,
    salt: NSString,
    rounds: NSNumber,
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    let saltPointer = UnsafePointer<UInt8>(salt.cStringUsingEncoding(NSUTF8StringEncoding))
    let inputPointer = UnsafePointer<Int8>(input.cStringUsingEncoding(NSUTF8StringEncoding))

    let derivedKey = NSMutableData(length: kCCKeySizeAES256)
    let derivedKeyPointer = UnsafeMutablePointer<UInt8>(derivedKey!.mutableBytes)

    let result = CCKeyDerivationPBKDF(
      CCPBKDFAlgorithm(kCCPBKDF2),
      inputPointer,
      input.lengthOfBytesUsingEncoding(NSUTF8StringEncoding),
      saltPointer,
      salt.length,
      CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
      rounds.unsignedIntValue,
      derivedKeyPointer,
      derivedKey!.length
    )

    if (result != 0) {
      let message = "Could not derive key."
      let userInfo = [
        NSLocalizedDescriptionKey: message,
        NSLocalizedFailureReasonErrorKey: "CCKeyDerivationPBKDF failed with code \(result).",
      ]
      let error = NSError(domain: "com.silklabs.app", code: Int(result), userInfo: userInfo)
      rejecter("E_PBKDF2_FAILED", message, error)
      return
    }

    resolver(derivedKey!.hexString)
  }

  public func getRandomBytes(
    length: NSNumber,
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    let bytes = [UInt8](count: Int(length), repeatedValue: 0)
    let result = SecRandomCopyBytes(kSecRandomDefault, Int(length), UnsafeMutablePointer<UInt8>(bytes))

    if (result != 0) {
      let message = "Could not generate random bytes."
      let userInfo = [
        NSLocalizedDescriptionKey: message,
        NSLocalizedFailureReasonErrorKey: "SecRandomCopyBytes failed with code \(result).",
      ]
      let error = NSError(domain: "com.silklabs.app", code: Int(result), userInfo: userInfo)
      rejecter("E_RAND_BYTES_FAILED", message, error)
      return
    }

    // [Uint8] is not automatically encoded to [NSNumber], while [Int] is.
    resolver(bytes.map{ Int($0) })
  }

}