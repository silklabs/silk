public class DebugLog {

  static var enabled: [NSRegularExpression] = []
  static var skips: [NSRegularExpression] = []

  public static func reset() {
    self.enabled = []
    self.skips = []
  }

  private class func addRegex(pattern: String, inout target: [NSRegularExpression]) {
    let regex = try? NSRegularExpression(pattern: "^\(pattern)$", options: [])
    if regex != nil {
      target.append(regex!)
    } else {
      NSLog("Error constructing debug regex: \(pattern)")
    }
  }

  /**
   * Enable debug namespaces closely follows:
   *
   * https://github.com/visionmedia/debug/blob/fefdae5fd112156b101b6a62c19ca469b730bc5b/debug.js#L136
   *
   * Supports multiple enable/disables via ,
   */
  public static func enable(name: String) {
    // Convert the string into a regex expression...
    let namespaces = name.characters.split { $0 == " " || $0 == "," }.map { String($0) }

    for namespace in namespaces {
      var pattern = namespace.stringByReplacingOccurrencesOfString(
        "*", withString: ".*?"
      )

      if pattern.hasPrefix("-") {
        // Skip pattern
        pattern = pattern.substringFromIndex(pattern.startIndex.advancedBy(1))
        self.addRegex(pattern, target: &self.skips)
      } else {
        // Enable pattern
        self.addRegex(pattern, target: &self.enabled)
      }
    }
  }

  private static func matches(name: String, list: [NSRegularExpression]) -> Bool {
    for regex in list {
      let range = NSMakeRange(0, name.characters.count)
      let matches = regex.matchesInString(name, options: [], range: range)
      if matches.count > 0 {
        return true
      }
    }
    return false
  }

  public static func isEnabled(name: String) -> Bool {
    if self.matches(name, list: self.enabled) {
      return !self.matches(name, list: self.skips)
    }
    return false
  }

  static public func create(name: String) -> DebugLogLogger {
    return DebugLogLogger(name: name)
  }
}

public class DebugLogLogger {

  let name: String

  init(name: String) {
    self.name = name
  }

  func print(name: String, str: String, args: [AnyObject]) {
    let namespace = "\(self.name):\(name)"
    let mesasge = "[\(namespace)] \(str)"

    if (DebugLog.isEnabled(namespace)) {
      NSLog(mesasge, args)
    }
  }

  public func debug(str: String, _ args:AnyObject...) {
    self.print("debug", str: str, args: args)
  }

  public func info(str: String, _ args:AnyObject...) {
    self.print("info", str: str, args: args)
  }

  public func error(str: String, _ args:AnyObject...) {
    self.print("error", str: str, args: args)
  }

}