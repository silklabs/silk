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

internal func iterateViews(view: RCTComponent!, block: (RCTComponent) -> Void) {
  for subview in view.reactSubviews() {
    iterateViews(subview as! RCTComponent, block)
  }

  if view.reactTag != nil {
    block(view)
  }
}

class OverlayModal : RCTView {

  var overlayController: OverlayModalController?
  var overlayView: RCTView?
  var touchHandler: RCTTouchHandler?

  var orientation = "landscape"

  required init(coder aDecoder: NSCoder) {
    NOT_IMPLEMENTED()
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

  override func insertReactSubview(subview: RCTComponent!, atIndex: Int) {
    self.overlayView!.insertReactSubview(subview, atIndex: atIndex)
  }

  /**
  Note this is critically important to expose as React cannot properly remove subviews without knowing
  where they are!
  */
  override func reactSubviews() -> [AnyObject] {
    return self.overlayView!.reactSubviews()
  }

  override func removeFromSuperview() {
    // Ensure we always have dismissed the controller when removing this view...
    self.dismiss() {(_) in}

    // Note: we intentionally remove anything that references self.overlayView but not
    // self.overlayView itself (it will be release along with this view)
    self.overlayController = nil
    self.touchHandler = nil
    super.removeFromSuperview()
  }

  // Because our views are not part of the root react view 
  // we must propigate the message across to our subviews.
  override func reactBridgeDidFinishTransaction() {
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

    // Do not attempt to show the controller if it is already displaying...
    if controller.presentedViewController == self.overlayController {
      callback([])
      return
    }

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