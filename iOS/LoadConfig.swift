public struct ConfigReactNative {
  public var url: String? = "main.jsbundle"
  public var type: String? = "bundle"

  init(_ hasDict: Dictionary<String, String>?) {
    if let dict = hasDict {
      self.url = dict["url"]
      self.type = dict["type"]
    }
  }
}

public struct Config {
  public var reactNative = ConfigReactNative(nil)
}


public class LoadConfig {

  static public func load(data: NSData) -> (result: Config?, err: NSError?) {
    var error: NSError?
    let result: AnyObject? = NSJSONSerialization.JSONObjectWithData(
      data,
      options: nil,
      error: &error
    )

    if error != nil {
      return (nil, error)
    }

    if let jsonDict = result {
      let reactNative = ConfigReactNative(
        jsonDict["react-native"] as? Dictionary<String, String>
      )
      let config = Config(reactNative: reactNative)
      return (config, nil)
    }

    return (nil, nil)
  }
}