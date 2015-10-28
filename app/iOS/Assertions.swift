/**
 * This module contains a collection of useful assertions these only run in debug builds!
 */

/**
 * Run an assertion note that assertion uses blocks so we can run abitrarily complex assertion
 * logic which will be completely ignored in production.
 */
public func Assertion(block: () -> Bool, message: String) {
  #if DEBUG
    let value = block()
    if value == false {
      let err = NSException(name: "Assertion", reason: message, userInfo: nil)
      err.raise()
    }
  #endif
}

public func AssertMainThread() {
  Assertion(
    {
      NSThread.isMainThread()
    },
    message: "Must be called on the main thread"
  )
}