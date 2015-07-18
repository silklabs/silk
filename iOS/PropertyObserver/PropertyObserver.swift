import Foundation

/**
Abstraction for the KVO provided on NSObject(s) to provide callback interfaces.

Marked final to ensure we don't need to deal with weird potential subclassing cases related to KVO and contexts.
*/
public final class PropertyObserverKey: NSObject {
  // Represents the lambda callback given to this object...
  public typealias Callback = (kvo: PropertyObserverKey, change: [NSObject: AnyObject?]) -> Void
  
  // All NSObject(s) are observable...
  unowned var observable: NSObject
  let keyPath: String
  let callback: Callback

  /**
  We must pass some value to the context parameter when observing KVO typically this value is used in objc so you
  can associate some value with a particular observer call (as in objc you use KVO typically with an inheritane model).
  
  This is set purely to satisfy the type constrants and we don not use it for anything else.
  */
  var context = 0;
  
  public init(_ observable: NSObject, keyPath: String, callback: Callback) {
    self.observable = observable
    self.keyPath = keyPath
    self.callback = callback
    super.init()
  }

  public func beginObserve() {
    self.observable.addObserver(self, forKeyPath: self.keyPath, options: NSKeyValueObservingOptions.New,
      context: &context)
  }
  
  override public func observeValueForKeyPath(keyPath: String, ofObject: AnyObject, change: [NSObject: AnyObject], context: UnsafeMutablePointer<Void>) {
    if (keyPath != self.keyPath) {
      println("Unknown call into observeValueForKeyPath \(keyPath)")
      return
    }
    self.callback(kvo: self, change: change)
  }
  
  // Remove functionality is exposed via the PropertyObserver
  internal func remove() {
    self.observable.removeObserver(self, forKeyPath: self.keyPath)
  }
}

private var objectAssociationKey : UInt8 = 0

extension NSObject {

  // Extensions cannot use stored properties so we need some magic...
  public var propertyObserverItems: Set<PropertyObserverKey>! {
    get {
      var items = objc_getAssociatedObject(self, &objectAssociationKey) as? Set<PropertyObserverKey>
      if items == nil {
        self.propertyObserverItems = Set<PropertyObserverKey>([])
        return self.propertyObserverItems
      }
      return items
    }
    set(newValue) {
      objc_setAssociatedObject(self, &objectAssociationKey, newValue, objc_AssociationPolicy(OBJC_ASSOCIATION_RETAIN))
    }
  }

  /**
  Fire callback when a value changes in given key path
  */
  public func observeKeyPath(keyPath: String, callback: PropertyObserverKey.Callback) -> PropertyObserverKey {
    var kvo = PropertyObserverKey(self, keyPath: keyPath, callback: callback)
    self.propertyObserverItems.insert(kvo)
    // Begin observing only after we track the item...
    kvo.beginObserve()
    return kvo
  }
  
  /**
  Remove KVO object from observers (will ensure no more callbacks are fired)
  */
  public func removeKeyPathObserver(kvo: PropertyObserverKey) -> Bool {
    let contains = self.propertyObserverItems.contains(kvo)
    if self.propertyObserverItems.contains(kvo) {
      // Ensure it is no longer listening for changes...
      kvo.remove();
      self.propertyObserverItems.remove(kvo)
      return true
    }
    return false
  }

  /**
  Convience func to remote all property observers.
  */
  public func removeAllKeyPathObservers() {
    for kvo in self.propertyObserverItems {
      self.removeKeyPathObserver(kvo)
    }
  }
}