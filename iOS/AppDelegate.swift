import UIKit

@UIApplicationMain
class AppDelegate : UIResponder, UIApplicationDelegate {

  var window: UIWindow?

  func application(application: UIApplication, didFinishLaunchingWithOptions launchOptions: [NSObject: AnyObject]?) -> Bool {
    // There are two options for loading ReactNative
    // 1. (Production) use app bundle
    //let url = NSBundle.mainBundle().URLForResource("main", withExtension: "jsbundle")

    // 2. Use localhost
    let url = NSURL(string: "http://localhost:8081/index.ios.bundle")
    let rootView = RCTRootView(bundleURL: url, moduleName: "Silk", launchOptions: launchOptions)

    // At least for now we don't implement our own specific controller...
    let rootViewController = UIViewController()
    rootViewController.view = rootView

    self.window = UIWindow(frame: UIScreen.mainScreen().bounds)

    self.window?.rootViewController = rootViewController
    self.window?.makeKeyAndVisible()

    return true
  }

}