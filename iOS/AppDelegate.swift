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

  // Display region enter/exit notifications to the user
  func notifyUser(notificationText: String) {
    // Ask user permission for user notifications
    let registerUserNotificationSettings = UIApplication.instancesRespondToSelector("registerUserNotificationSettings:")
    if registerUserNotificationSettings {
      var types: UIUserNotificationType = UIUserNotificationType.Alert | UIUserNotificationType.Sound | UIUserNotificationType.Badge
      UIApplication.sharedApplication().registerUserNotificationSettings(UIUserNotificationSettings(forTypes: types, categories: nil))
    }

    var notification = UILocalNotification()
    notification.alertBody = notificationText
    notification.fireDate = NSDate()
    notification.soundName = UILocalNotificationDefaultSoundName
    UIApplication.sharedApplication().scheduleLocalNotification(notification)
  }

  func regionStateChanged(entered: Bool) {
    notifyUser("Silk device is " + (entered ? "in range" : "out of range"))
    self.homeBeacon!.setIsEnabled(entered)
  }

  func applicationWillResignActive(application: UIApplication) {
    NSLog("applicationWillResignActive");
    self.regionMonitor!.applicationWillResignActive()
  }

  func applicationDidBecomeActive(application: UIApplication) {
    NSLog("applicationDidBecomeActive");
    self.regionMonitor!.applicationDidBecomeActive()
  }
}
