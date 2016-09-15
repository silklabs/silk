import AVFoundation
import CoreLocation
import UIKit

private let log = DebugLog.create("silk-app")

@UIApplicationMain
class AppDelegate : UIResponder,
                    UIApplicationDelegate,
                    RegionMonitorDelegate,
                    RCTBridgeDelegate {

  var config: SLKConfig?
  var regionMonitor: RegionMonitor?
  var bleSocketPeripheral: BLESocketPeripheral?
  var window: UIWindow?
  var inForeground: Bool = false

  override init() {
    super.init()
  }

  func application(application: UIApplication, didFinishLaunchingWithOptions launchOptions: [NSObject: AnyObject]?) -> Bool {
    CrashReporter.start();
    self.config = SLKConfig()

    // Configuring logging
    DebugLog.enable(self.config!.debug)
    log.info("Logging level %@", self.config!.debug)

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
    let rootViewController = UIViewController()
    rootViewController.view = rootView

    self.window = UIWindow(frame: UIScreen.mainScreen().bounds)
    self.window?.rootViewController = rootViewController
    self.window?.makeKeyAndVisible()

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

  func application(application: UIApplication, supportedInterfaceOrientationsForWindow window: UIWindow?) -> UIInterfaceOrientationMask {
    return Orientation.getOrientation()
  }

  // Display region enter/exit notifications to the user
  func notifyUser(notificationText: String) {
    // Ask user permission for user notifications
    let registerUserNotificationSettings =
      UIApplication.instancesRespondToSelector(#selector(UIApplication.registerUserNotificationSettings(_:)))
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
    self.bleSocketPeripheral!.regionAdded(uuid)
  }

  func regionRemoved(regionMonitor: RegionMonitor, uuid: NSUUID) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    self.bleSocketPeripheral!.regionRemoved(uuid)
  }

  func regionEntered(regionMonitor: RegionMonitor, uuid: NSUUID) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    if uuid == RegionMonitor.configBeaconUuid {
      notifyUser("An unconfigured Silk device is nearby.")
    }
    self.bleSocketPeripheral!.regionEntered(uuid)
  }

  func regionExited(regionMonitor: RegionMonitor, uuid: NSUUID) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    self.bleSocketPeripheral!.regionExited(uuid)
  }

  func regionBeacons(regionMonitor: RegionMonitor, uuid: NSUUID, deviceNumbers: Set<Int>) {
    assert(regionMonitor === self.regionMonitor!)
    assert(self.bleSocketPeripheral != nil)
    self.bleSocketPeripheral!.regionBeacons(uuid, deviceNumbers: deviceNumbers)
  }

  // RCTBridgeDelegate

  func sourceURLForBridge(bridge: RCTBridge!) -> NSURL! {
    return self.config!.jsBundleURL!
  }

  func extraModulesForBridge(bridge: RCTBridge!) -> [RCTBridgeModule]! {
    return [
      self.config!,
      // We're overriding React Native's WebSocket module by the same name.
      SLKWebSocketModule(),
      // Explicitly init this here rather than letting React Native init it
      // lazily later, which would almost certainly be too late.
      BLESocketManager(),
    ]
  }
}
