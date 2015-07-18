import UIKit

@UIApplicationMain
class AppDelegate : UIResponder, UIApplicationDelegate {

  var window: UIWindow?

  func loadConfig() -> Config {
    let url = NSBundle.mainBundle().URLForResource("config.local.json", withExtension: "")
    if url == nil {
      return Config()
    }

    // If your specify a url your responsible for validating its json
    let data = NSData(contentsOfURL: url!)!
    let (config, err) = LoadConfig.load(data)
    if err != nil {
      // This is on boot and should only be in the development path so raise...
      NSException.raise("Exception", format:"Error: %@", arguments:getVaList([err!]))
    }
    return config!
  }

  func application(application: UIApplication, didFinishLaunchingWithOptions launchOptions: [NSObject: AnyObject]?) -> Bool {
    let config = self.loadConfig()
    var reactViewURL: NSURL
    let reactNativeType = config.reactNative.type
    let reactNativeUrl = config.reactNative.url!

    if reactNativeType == "bundle" {
      reactViewURL = NSBundle.mainBundle().URLForResource(reactNativeUrl, withExtension: "")!
      println("Starting react-native with bundle: \(reactNativeUrl)")
    } else {
      reactViewURL = NSURL(string: reactNativeUrl)!
      println("Starting react-native with remote url: \(reactNativeUrl)")
    }

    let rootView = RCTRootView(bundleURL: reactViewURL, moduleName: "Silk", launchOptions: launchOptions)

    // At least for now we don't implement our own specific controller...
    let rootViewController = ViewController()
    rootViewController.view = rootView

    self.window = UIWindow(frame: UIScreen.mainScreen().bounds)

    self.window?.rootViewController = rootViewController
    self.window?.makeKeyAndVisible()

    return true
  }

}
