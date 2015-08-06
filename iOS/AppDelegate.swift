import UIKit
import CoreLocation

@UIApplicationMain
class AppDelegate : UIResponder, UIApplicationDelegate, RegionUpdatesDelegate {

  var window: UIWindow?
  var regionMonitor: RegionMonitor?
  var homeBeacon: HomeBeacon?

  // This is the unique UUID of silk-device
  let homeRegionUuid = "E0F3A744-FB2F-46F1-B45A-F2B398F2A424"

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
      NSLog("Starting react-native with bundle: \(reactNativeUrl)")
    } else {
      reactViewURL = NSURL(string: reactNativeUrl)!
      NSLog("Starting react-native with remote url: \(reactNativeUrl)")
    }

    let rootView = RCTRootView(bundleURL: reactViewURL, moduleName: "Silk", launchOptions: launchOptions)

    // At least for now we don't implement our own specific controller...
    let rootViewController = ViewController()
    rootViewController.view = rootView

    self.window = UIWindow(frame: UIScreen.mainScreen().bounds)

    self.window?.rootViewController = rootViewController
    self.window?.makeKeyAndVisible()

    // Start monitoring for home region
    self.regionMonitor = RegionMonitor(uuid: homeRegionUuid)
    self.regionMonitor!.delegate = self
    self.homeBeacon = HomeBeacon()

    return true
  }

  func regionStateChanged(entered: Bool) {
    if self.entered != entered {
      self.entered = entered;
      let alert = UIAlertController(title: "Info", message: "Region entered: \(entered)", preferredStyle: UIAlertControllerStyle.Alert)
      let alertAction = UIAlertAction(title: "OK!", style: UIAlertActionStyle.Default) { (UIAlertAction) -> Void in }
      alert.addAction(alertAction)
      self.window?.rootViewController?.presentViewController(alert, animated: true, completion: nil)
    }

    self.homeBeacon!.setIsEnabled(entered)
  }

  func applicationWillResignActive(application: UIApplication) {
    self.regionMonitor!.applicationWillResignActive()
  }

  func applicationDidBecomeActive(application: UIApplication) {
    self.regionMonitor!.applicationDidBecomeActive()
  }
}
