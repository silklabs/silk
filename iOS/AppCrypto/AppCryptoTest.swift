import Silk
import XCTest
import Foundation

class AppCryptoTest: XCTestCase {

  func testAppCrypto() {
    let subject = AppCrypto()
    var result: [UInt8] = []
    subject.getRandomBytes(32, callback: {
      (value) in
      let numbers = value[0] as! [NSNumber]
      for number in numbers {
        result.append(number.unsignedCharValue)
      }
    })
    XCTAssert(result.count == 32, "Returns right number of bytes")
  }

  func testPBKDF2KeyDerivation() {
    let start = NSDate()
    let subject = AppCrypto()

    var password = "silklabs"
    let salt: NSString = "engineering@silklabs.com"
    let rounds = 64000
    var out: String = ""

    subject.PBKDF2KeyDerivation(password, salt: salt, rounds: rounds, callback: {
      (value) in
      out = value[0] as! String
    })

    // https://github.com/silklabs/silk-server/blob/337920132ce6b9712bb5fa50e08811151f8ec906/src/api/dev_account.js#L15
    XCTAssert(out == "fed892d4c48cb16af5f1fb33754a81be59809518046a7990208c6a61e4b731b8", "hash must be compatible with JS generated kdf")

    let end = NSDate()
    let interval = end.timeIntervalSinceDate(start) * 1000
    println("took: \(interval) ms")
  }
  
}
