import Silk
import XCTest

class SLKConfigTest: XCTestCase {

  func testEmptyConfig() {
    let data: NSData? = nil
    let config = SLKConfig(data: data)
    XCTAssert(config.jsBundleURL!.absoluteString.hasSuffix("/main.jsbundle"), "defaults to packaged JS bundle")
  }

  func testRemoteBundle() {
    let bundleURL = "http://localhost/path/to/remote/js.bundle"
    let config_json = "{\"react-native\": {\"type\": \"remote\", \"url\": \"\(bundleURL)\"}}"
    let config = SLKConfig(data: config_json.dataUsingEncoding(NSUTF8StringEncoding)!)
    XCTAssert(config.jsBundleURL!.absoluteString == bundleURL, "Uses specified bundle URL")
  }

  func testLocalBundle() {
    let bundleURL = "http://localhost/path/to/local/js.bundle"
    let config_json = "{\"react-native\": {\"type\": \"local\", \"url\": \"\(bundleURL)\"}}"
    let config = SLKConfig(data: config_json.dataUsingEncoding(NSUTF8StringEncoding)!)
    XCTAssert(config.jsBundleURL!.absoluteString.hasSuffix("/main.jsbundle"), "local JS bundle gets packaged")
  }

  func testJSON() {
    let config_json = "{\"debug\": \"*\"}"
    let config = SLKConfig(data: config_json.dataUsingEncoding(NSUTF8StringEncoding)!)
    XCTAssert(config.json != nil)
    let json = config.json!
    XCTAssert(json["debug"] as? String == "*")
  }

}