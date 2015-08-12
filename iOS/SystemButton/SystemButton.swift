import UIKit

class SystemButton : UIToolbar {

  var eventDispatcher: RCTEventDispatcher!
  var button: UIBarButtonItem?

  var color: UIColor? {
    didSet {
      if let button = self.button {
        button.tintColor = self.color!
      }
    }
  }

  // public (react exposed) property for button type (maps to .style)
  var type: NSNumber = 0 {
    didSet {
      self.setButtonType(UIBarButtonSystemItem(rawValue: self.type as Int)!)
    }
  }

  init(eventDispatcher: RCTEventDispatcher) {
    super.init(frame: CGRectZero)

    self.eventDispatcher = eventDispatcher

    // Create transparent background.
    self.setBackgroundImage(UIImage.new(), forToolbarPosition: UIBarPosition.Any, barMetrics: UIBarMetrics.Default)
    self.setShadowImage(UIImage.new(), forToolbarPosition: UIBarPosition.Any)
  }

  override init(frame: CGRect) {
    NOT_IMPLEMENTED()
    super.init(frame: frame)
  }

  required init(coder aDecoder: NSCoder) {
    NOT_IMPLEMENTED()
    super.init(coder: aDecoder)
  }

  func setButtonType(type: UIBarButtonSystemItem) {
    self.button = UIBarButtonItem(barButtonSystemItem: type, target: self, action: Selector("onPress"))
    if self.color != nil {
      self.button!.tintColor = self.color
    }

    self.setItems([self.button!], animated: false)
  }

  func onPress() {
    let eventBody: Dictionary<String, AnyObject> = [
      "target": self.reactTag
    ]
    self.eventDispatcher.sendInputEventWithName("press", body: eventBody)
  }

}