class ViewController: UIViewController {

  /**
  This will force all primary views (i.e. views which do not provide their own controllers
  like OverlayModal do) to these orientations.
  */
  override func supportedInterfaceOrientations() -> Int {
    // XXX: Upsidedown does not seem to work as expected it is omitted
    return Int(UIInterfaceOrientationMask.Portrait.rawValue)
  }

}