let DEBUG_DEFAULT = "silk*"

@objc(SLKConfig)
public class SLKConfig : NSObject, RCTBridgeModule  {

  // RCTBridgeModule

  public class func moduleName() -> String {
    return "SLKConfig"
  }

  public func constantsToExport() -> [String: AnyObject] {
    if (self.json != nil) {
      return self.json!
    }
    return [:]
  }

  // API

  public var jsBundleURL: NSURL? = NSBundle.mainBundle().URLForResource("main", withExtension: "jsbundle")
  public var debug: String = DEBUG_DEFAULT
  public var json: Dictionary<String, AnyObject>? = nil

  // Internal

  override init() {
    super.init()
    var data: NSData? = nil
    let url = NSBundle.mainBundle().URLForResource("config.local.json", withExtension: "")
    if let url = url {
      data = NSData(contentsOfURL: url)
    }
    self.load(data)
  }

  // For tests
  public init(data: NSData?) {
    super.init()
    self.load(data)
  }

  public func load(data: NSData?) {
    guard let data = data else {
      return
    }

    var json: AnyObject? = nil
    do {
      json = try NSJSONSerialization.JSONObjectWithData(data, options: [])
    } catch {
      return
    }

    guard let config = json else {
      return
    }

    self.json = config as? Dictionary<String, AnyObject>

    if let reactNative = config["react-native"] as? Dictionary<String, String> {
      let bundleType = reactNative["type"]
      if bundleType == "remote" {
        let url = reactNative["url"]!
        NSLog("Using remote JS bundle: \(url)")
        self.jsBundleURL = NSURL(string: url)
      }
    }

    if let debugStr = config["debug"] as? String {
      self.debug = debugStr
    }
  }
}