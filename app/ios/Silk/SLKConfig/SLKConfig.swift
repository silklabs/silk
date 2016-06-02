let DEBUG_DEFAULT = "silk*"

public struct Config {
  public var bundleURL: NSURL? = nil
  public var debug: String = DEBUG_DEFAULT
}

public class SLKConfig {

  static public func load(data: NSData?) -> (result: Config?, err: NSError?) {
    var debug = DEBUG_DEFAULT
    var bundleURL = NSBundle.mainBundle().URLForResource("main", withExtension: "jsbundle")

    if let data = data {
      let result: AnyObject?
      do {
        result = try NSJSONSerialization.JSONObjectWithData(
          data,
          options: []
        )
      } catch let error as NSError {
        return (nil, error)
      }

      if let jsonDict = result {
        if let reactNative = jsonDict["react-native"] as? Dictionary<String, String> {
          let bundleType = reactNative["type"]
          if bundleType == "remote" {
            let url = reactNative["url"]!
            NSLog("Using remote JS bundle: \(url)")
            bundleURL = NSURL(string: url)
          }
        }

        if let debugStr = jsonDict["debug"] as? String {
          debug = debugStr
        }
      }
    }
    let config = Config(bundleURL: bundleURL, debug: debug)
    return (config, nil)
  }
}