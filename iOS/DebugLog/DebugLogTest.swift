import Silk
import XCTest

class DebugLogTest: XCTestCase {
  override func setUp() {
    DebugLog.reset()
  }
  override func tearDown() {
    DebugLog.reset()
  }

  func testEnabled() {
    let name = "woot:bar:baz"
    let tests = [
      "woot": false,
      "*": true,
      "woot:*": true,
      "woot,woot:bar:baz": true,
      "woot,woot:*": true,
      "woot,woot:bar:baz,-woot:bar:baz": false,
    ]

    for (enabled, expected) in tests {
      DebugLog.enable(enabled)
      XCTAssert(DebugLog.isEnabled(name) == expected, "Expected \(enabled) on \(name) to be \(expected)")
      DebugLog.reset()
    }

  }

  // This test is sorta lame it's purpose is so we can visually inspect output.
  func testDebugLog() {
    DebugLog.enable("*")
    let log = DebugLog.create("silk-foo");
    log.debug("log %@", "value")
    log.info("log %@", "value")
    log.error("log %@", "value")
  }
  
}
