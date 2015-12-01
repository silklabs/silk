@objc(SystemButtonManager)
class SystemButtonManager : RCTViewManager {

  override func view() -> UIView! {
    return SystemButton(eventDispatcher: self.bridge!.eventDispatcher)
  }

  @objc override func customBubblingEventTypes() -> [String]! {
    return [
      "press",
    ]
  }

  override func constantsToExport() -> [NSObject : AnyObject]{
    // Export the entire UIBarButtonSystemItem enum so it's easy for JS to see what is available.
    return [
      "Done": UIBarButtonSystemItem.Done.rawValue,
      "Cancel": UIBarButtonSystemItem.Cancel.rawValue,
      "Save": UIBarButtonSystemItem.Save.rawValue,
      "Add": UIBarButtonSystemItem.Add.rawValue,
      "FlexibleSpace": UIBarButtonSystemItem.FlexibleSpace.rawValue,
      "FixedSpace": UIBarButtonSystemItem.FixedSpace.rawValue,
      "Compose": UIBarButtonSystemItem.Compose.rawValue,
      "Reply": UIBarButtonSystemItem.Reply.rawValue,
      "Action": UIBarButtonSystemItem.Action.rawValue,
      "Organize": UIBarButtonSystemItem.Organize.rawValue,
      "Bookmarks": UIBarButtonSystemItem.Bookmarks.rawValue,
      "Search": UIBarButtonSystemItem.Search.rawValue,
      "Refresh": UIBarButtonSystemItem.Refresh.rawValue,
      "Stop": UIBarButtonSystemItem.Stop.rawValue,
      "Camera": UIBarButtonSystemItem.Camera.rawValue,
      "Trash": UIBarButtonSystemItem.Trash.rawValue,
      "Play": UIBarButtonSystemItem.Play.rawValue,
      "Pause": UIBarButtonSystemItem.Pause.rawValue,
      "Rewind": UIBarButtonSystemItem.Rewind.rawValue,
      "FastForward": UIBarButtonSystemItem.FastForward.rawValue,
      "Undo": UIBarButtonSystemItem.Undo.rawValue,
      "Redo": UIBarButtonSystemItem.Redo.rawValue,
      "PageCurl": UIBarButtonSystemItem.PageCurl.rawValue,
    ]
  }

}