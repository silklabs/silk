import Silk
import XCTest

class TypeTransferTest: XCTestCase {

  func testEmbeddedData() {
    let bin = NSData()
    let input = [
      "wootbar": [
        "blob": bin
      ]
    ]

    let transfer: AnyObject = TypeTransfer.convert(input)
    let hasWootbar = transfer["wootbar"] is Dictionary<String, AnyObject>
    XCTAssert(hasWootbar, "has nested dict")
    let wootbar = transfer["wootbar"] as! Dictionary<String, AnyObject>

    var blob = wootbar["blob"] as! Dictionary<String, AnyObject>
    var blobValue = NSDataBridge.release(blob["id"] as! String)
    XCTAssert(bin === blobValue, "returns equal blob")
  }
  
}