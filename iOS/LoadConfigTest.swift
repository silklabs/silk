import Silk
import XCTest

class LoadConfigTest: XCTestCase {

  func testLoadConfig() {
    // Base64 encoded json string
    // {
    //   "react-native": {
    //     "url": "xfoo",
    //     "type": "bundle"
    //   }
    // }
    let dataURI = "data:text/plain;charset=utf-8;base64,eyJyZWFjdC1uYXRpdmUiOiB7InVybCI6ICJ4Zm9vIiwgInR5cGUiOiAiYnVuZGxlIn19"
    let url = NSURL(string: dataURI)!
    let data = NSData(contentsOfURL: url)!

    let (config, err) = LoadConfig.load(data)

    XCTAssert(err == nil, "Should successfully load...")
    XCTAssert(config!.reactNative.type == "bundle", "has react-native.type")
    XCTAssert(config!.reactNative.url == "xfoo", "has react-native.url")
  }

}