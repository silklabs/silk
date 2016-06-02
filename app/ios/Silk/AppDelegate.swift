import AVFoundation
import CoreLocation
import UIKit

private let log = DebugLog.create("silk-app")

@UIApplicationMain
class AppDelegate : UIResponder,
                    UIApplicationDelegate,
                    RegionMonitorDelegate,
                    RCTBridgeDelegate {

  var config: Config?
  var regionMonitor: RegionMonitor?
  var bleSocketPeripheral: BLESocketPeripheral?
  var window: UIWindow?
  var inForeground: Bool = false

  override init() {
    super.init()
  }

  func loadConfig() -> Config {
    if let config = self.config {
      return config
    }

    var data: NSData? = nil
    let url = NSBundle.mainBundle().URLForResource("config.local.json", withExtension: "")
    if let url = url {
      data = NSData(contentsOfURL: url)
    }
    let (config, err) = SLKConfig.load(data)
    if err != nil {
      // This is on boot and should only be in the development path so raise...
      NSException.raise("Exception", format:"Error: %@", arguments:getVaList([err!]))
    }
    self.config = config
    return config!
  }

  func application(application: UIApplication, didFinishLaunchingWithOptions launchOptions: [NSObject: AnyObject]?) -> Bool {
    CrashReporter.start();
    let config = self.loadConfig()

    // Configuring logging
    DebugLog.enable(config.debug)
    log.info("Logging level %@", config.debug)

    // Make sure we wait until DebugLog is set up before we load any code that
    // uses it.

    self.regionMonitor = RegionMonitor(delegate: self)
    let bridge = RCTBridge(delegate: self, launchOptions: launchOptions)
    let rootView = RCTRootView(bridge: bridge, moduleName: "Silk", initialProperties: nil)

    // This must not be created until *after* ReactNative has loaded all its
    // modules during the |RCTBridge| initializer.
    self.bleSocketPeripheral = BLESocketPeripheral(regionMonitor: self.regionMonitor!)

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

  // RegionMonitorDelegate

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

  // RCTBridgeDelegate

  func sourceURLForBridge(bridge: RCTBridge!) -> NSURL! {
    return self.loadConfig().bundleURL!
  }

  func extraModulesForBridge(bridge: RCTBridge!) -> [AnyObject]! {
    return [
      // We're overriding React Native's WebSocket module by the same name.
      SLKWebSocketModule(),
      // Explicitly init this here rather than letting React Native init it
      // lazily later, which would almost certainly be too late.
      BLESocketManager(),
    ]
  }
}
