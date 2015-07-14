import Silk
import XCTest


class PropertyObserverTests: XCTestCase {
  
  class TestObj: NSObject {
    // Note: dynamic is needed here for the observer to fire...
    dynamic var xfoo: String?
  }
  
  func testSimplePropertyUpdate() {
    var obj = TestObj()
    var expectation = expectationWithDescription("property change")

    obj.observeKeyPath("xfoo") {
      kvo, change in
      XCTAssert(obj.xfoo == "xxx", "should fire after update")
      
      // Clear the observer...
      let didRemove = obj.removeKeyPathObserver(kvo)
      XCTAssert(didRemove, "successfully removed kvo")
      
      // Change value from observer to ensure .remove is working correctly...
      obj.xfoo = "zzzz"
      expectation.fulfill()
    }

    obj.xfoo = "xxx"

    waitForExpectationsWithTimeout(5, handler: {
      (error) in
      // Yay we completed...
    })
  }
  
  override func tearDown() {
    super.tearDown()
  }
  
}