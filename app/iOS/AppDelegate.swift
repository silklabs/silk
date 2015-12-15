import AVFoundation
import CoreLocation
import UIKit

private let log = DebugLog.create("silk-app")

@UIApplicationMain
class AppDelegate : UIResponder, UIApplicationDelegate, RegionMonitorDelegate {

  var regionMonitor: RegionMonitor?
  var bleSocketPeripheral: BLESocketPeripheral?
  var window: UIWindow?
  var inForeground: Bool = false

  override init() {
    super.init()
  }

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

    // Configuring logging
    DebugLog.enable(config.debug)
    log.info("Logging level %@", config.debug)

    // Make sure we wait until DebugLog is set up before we load any code that
    // uses it.

    self.regionMonitor = RegionMonitor(delegate: self)

    var reactViewURL: NSURL
    let reactNativeType = config.reactNative.type
    let reactNativeUrl = config.reactNative.url!

    if reactNativeType == "bundle" || reactNativeType == "local" {
      reactViewURL = NSBundle.mainBundle().URLForResource(reactNativeUrl, withExtension: "")!
      NSLog("Starting react-native with bundle: \(reactNativeUrl)")
    } else {
      reactViewURL = NSURL(string: reactNativeUrl)!
      NSLog("Starting react-native with remote url: \(reactNativeUrl)")
    }

    let rootView = RCTRootView(bundleURL: reactViewURL, moduleName: "Silk", initialProperties: nil, launchOptions: launchOptions)

    // This must not be created until *after* ReactNative has loaded all its
    // modules during the |RCTRootView| initializer.
    self.bleSocketPeripheral =
      BLESocketPeripheral(regionMonitor: self.regionMonitor!)

    self.regionMonitor!.start()

    // At least for now we don't implement our own specific controller...
    let rootViewController = ViewController()
    rootViewController.view = rootView

    self.window = UIWindow(frame: UIScreen.mainScreen().bounds)

    self.window?.rootViewController = rootViewController
    self.window?.makeKeyAndVisible()

    // Allow audio playback even when user has enabled mute switch.
    let _ = try? AVAudioSession.sharedInstance().setCategory(AVAudioSessionCategoryPlayback)

    return true
  }

  func applicationDidBecomeActive(application: UIApplication) {
    if !self.inForeground {
      self.inForeground = true
      self.bleSocketPeripheral?.setForeground()
    }
  }

  func applicationDidEnterBackground(application: UIApplication) {
    if self.inForeground {
      self.inForeground = false
      self.bleSocketPeripheral?.setBackground()
    }
  }

  // Display region enter/exit notifications to the user
  func notifyUser(notificationText: String) {
    // Ask user permission for user notifications
    let registerUserNotificationSettings = UIApplication.instancesRespondToSelector("registerUserNotificationSettings:")
    if registerUserNotificationSettings {
      let types: UIUserNotificationType = [UIUserNotificationType.Alert, UIUserNotificationType.Sound, UIUserNotificationType.Badge]
      UIApplication.sharedApplication().registerUserNotificationSettings(UIUserNotificationSettings(forTypes: types, categories: nil))
    }

    let notification = UILocalNotification()
    notification.alertBody = notificationText
    notification.fireDate = NSDate()
    notification.soundName = UILocalNotificationDefaultSoundName
    UIApplication.sharedApplication().scheduleLocalNotification(notification)
  }

  func regionAdded(regionMonitor: RegionMonitor, uuid: NSUUID) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    self.bleSocketPeripheral!.addServiceUuid(uuid)
  }

  func regionRemoved(regionMonitor: RegionMonitor, uuid: NSUUID) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    self.bleSocketPeripheral!.removeServiceUuid(uuid)
  }

  func regionEntered(regionMonitor: RegionMonitor, uuid: NSUUID) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    if uuid == RegionMonitor.configBeaconUuid {
      notifyUser("An unconfigured SilkCam is nearby.")
    }
    self.bleSocketPeripheral!.startAdvertisingServiceUuid(uuid)
  }

  func regionExited(regionMonitor: RegionMonitor, uuid: NSUUID) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    self.bleSocketPeripheral!.stopAdvertisingServiceUuid(uuid)
  }
}
