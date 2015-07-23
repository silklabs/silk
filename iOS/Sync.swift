/**
Generic synchronization tools
*/


/**
Aquire a lock on the given object and then perform an operation...
*/
public func objSync(lock: AnyObject, block: () -> Void) {
  objc_sync_enter(lock)
  block()
  objc_sync_exit(lock)
}