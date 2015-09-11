import Silk
import XCTest

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
  
}
