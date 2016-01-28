import Silk
import XCTest

class LoadConfigTest: XCTestCase {

  func testEmptyConfig() {
    let data: NSData? = nil
    let (config, err) = LoadConfig.load(data)
    XCTAssert(err == nil, "Should successfully load...")
    XCTAssert(config!.bundleURL!.absoluteString.hasSuffix("/main.jsbundle"), "defaults to packaged JS bundle")
  }

  func testRemoteBundle() {
    let bundleURL = "http://localhost/path/to/remote/js.bundle"
    let config_json = "{\"react-native\": {\"type\": \"remote\", \"url\": \"\(bundleURL)\"}}"
    let (config, err) = LoadConfig.load(config_json.dataUsingEncoding(NSUTF8StringEncoding)!)

    XCTAssert(err == nil, "Should successfully load...")
    XCTAssert(config!.bundleURL!.absoluteString == bundleURL, "Uses specified bundle URL")
  }

  func testLocalBundle() {
    let bundleURL = "http://localhost/path/to/local/js.bundle"
    let config_json = "{\"react-native\": {\"type\": \"local\", \"url\": \"\(bundleURL)\"}}"
    let (config, err) = LoadConfig.load(config_json.dataUsingEncoding(NSUTF8StringEncoding)!)

    XCTAssert(err == nil, "Should successfully load...")
    XCTAssert(config!.bundleURL!.absoluteString.hasSuffix("/main.jsbundle"), "local JS bundle gets packaged")
  }

}