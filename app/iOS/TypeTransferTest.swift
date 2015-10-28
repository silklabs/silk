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

    let isDict = transfer is Dictionary<String, AnyObject>
    XCTAssert(isDict, "is dict")
    let transferDict = transfer as! Dictionary<String, AnyObject>

    let hasWootbar = transferDict["wootbar"] is Dictionary<String, AnyObject>
    XCTAssert(hasWootbar, "has nested dict")
    let wootbar = transferDict["wootbar"] as! Dictionary<String, AnyObject>

    let blob = wootbar["blob"] as! Dictionary<String, AnyObject>
    let blobValue = NSDataBridge.release(blob["id"] as! String)
    XCTAssert(bin === blobValue, "returns equal blob")
  }
  
}