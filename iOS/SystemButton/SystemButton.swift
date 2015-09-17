import UIKit

class SystemButton : UIToolbar {

  var eventDispatcher: RCTEventDispatcher!
  var button: UIBarButtonItem?

  var enabled = true {
    didSet {
      if let button = self.button {
        button.enabled = self.enabled
      }
    }
  }

  var color: UIColor? {
    didSet {
      if let button = self.button {
        button.tintColor = self.color!
      }
    }
  }

  // public (react exposed) property for button type (maps to system item)
  var type: NSNumber = 0 {
    didSet {
      self.setButtonType(UIBarButtonSystemItem(rawValue: self.type as Int)!)
    }
  }

  init(eventDispatcher: RCTEventDispatcher) {
    super.init(frame: CGRectZero)

    self.eventDispatcher = eventDispatcher

    // Create transparent background.
    self.setBackgroundImage(UIImage(), forToolbarPosition: UIBarPosition.Any, barMetrics: UIBarMetrics.Default)
    self.setShadowImage(UIImage(), forToolbarPosition: UIBarPosition.Any)
  }

  override init(frame: CGRect) {
    NOT_IMPLEMENTED()
    super.init(frame: frame)
  }

  required init?(coder aDecoder: NSCoder) {
    NOT_IMPLEMENTED()
    super.init(coder: aDecoder)
  }

  func setButtonType(type: UIBarButtonSystemItem) {
    let button = UIBarButtonItem(barButtonSystemItem: type, target: self, action: Selector("onPress"))

    if self.color != nil {
      button.tintColor = self.color
    }
    button.enabled = self.enabled

    self.button = button
    self.setItems([button], animated: false)
  }

  func onPress() {
    let eventBody: Dictionary<String, AnyObject> = [
      "target": self.reactTag
    ]
    self.eventDispatcher.sendInputEventWithName("press", body: eventBody)
  }

}