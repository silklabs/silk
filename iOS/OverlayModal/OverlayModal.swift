import UIKit

class OverlayModalController: UIViewController {
  // TODO: Allow this to be configured...
  override func supportedInterfaceOrientations() -> Int {
    return Int(
      UIInterfaceOrientationMask.LandscapeLeft.rawValue |
      UIInterfaceOrientationMask.LandscapeRight.rawValue
    )
  }
}

internal func iterateViews(view: RCTViewNodeProtocol!, block: (RCTViewNodeProtocol) -> Void) {
  if view.reactTag != nil {
    block(view)
  }

  for subview in view.reactSubviews() {
    iterateViews(subview as! RCTViewNodeProtocol, block)
  }
}

class OverlayModal : RCTView {

  var overlayController: OverlayModalController?
  var overlayView: RCTView?
  var touchHandler: RCTTouchHandler?

  var orientation = "landscape"

  required init(coder aDecoder: NSCoder) {
    // This initializer is required but we never need it...
    let e = NSException(name: "Not implemented", reason: "This object cannot except coder initializer", userInfo: nil)
    NSException.raise("Exception", format:"Error: %@", arguments: getVaList([e]))
    super.init(coder: aDecoder)
  }

  init(bridge: RCTBridge) {
    super.init(frame: CGRectZero)

    // Initialize and register a custom touch handler so our subviews
    // get all the right messages.
    self.touchHandler = RCTTouchHandler(bridge: bridge)

    self.overlayController = OverlayModalController()
    self.overlayView = RCTView()
    self.overlayView?.addGestureRecognizer(self.touchHandler!)

    self.overlayController!.view = self.overlayView
  }

  override func insertReactSubview(subview: RCTViewNodeProtocol!, atIndex: Int) {
    self.overlayView!.insertReactSubview(subview, atIndex: atIndex)
  }

  override func removeFromSuperview() {
    // Since technically the views are in our overlay view when we get the message to remove
    // ourselves we need to remove everything in the overlay view too.
    for view in self.overlayView!.subviews {
      if view.respondsToSelector(Selector("removeFromSuperview")) {
        view.removeFromSuperview()
      }
    }

    // Ensure we always have dismissed the controller when removing this view...
    self.dismiss() {(_) in}

    self.overlayController = nil
    self.overlayView = nil
    self.touchHandler = nil
    super.removeFromSuperview()
  }

  // Because our views are not part of the root react view 
  // we must propigate the message across to our subviews.
  override func reactBridgeDidFinishTransaction() {
    var subviews = 0;
    iterateViews(self.overlayView!) {
      (view) in
      if view.respondsToSelector(Selector("reactBridgeDidFinishTransaction")) {
        view.reactBridgeDidFinishTransaction!()
      }
    }
  }

  func getRootController() -> UIViewController {
    let app = UIApplication.sharedApplication()
    return app.delegate!.window!!.rootViewController!
  }

  func show(callback: RCTResponseSenderBlock) {
    let controller = self.getRootController()
    controller.presentViewController(self.overlayController!, animated: false, completion: {
      () in
      callback([])
      return
    })
  }

  func dismiss(callback: RCTResponseSenderBlock) {
    let controller = self.getRootController()
    // If we are the presented controller dismiss it...
    if controller.presentedViewController === self.overlayController {
      controller.dismissViewControllerAnimated(true, completion: {
        () in
        callback([])
        return
      })
    } else {
      callback([])
      return
    }
  }
}