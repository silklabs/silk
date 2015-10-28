/**
Transfer utilities for _outgoing_ data (Native -> ReactNative).

ReactNative itself deals with turning values into strings but it does not
provide any advanced utilities for extending the types we can send so this
class provides a number of utilities for converting types.
*/
@objc(TypeTransfer)
public class TypeTransfer: NSObject {
  internal typealias JSONObj = Dictionary<String, AnyObject>
  internal typealias List = [AnyObject]

  class func convertDictionary(dict: JSONObj) -> JSONObj {
    var result: JSONObj = [:]
    for (key, value) in dict {
      result[key] = convert(value)
    }
    return result
  }

  class func convertArray(list: List) -> List {
    return list.map() {
      (obj) in
      return self.convert(obj)
    }
  }

  public class func convert(obj: AnyObject) -> AnyObject {
    switch (obj) {
    case is JSONObj:
      return convertDictionary(obj as! JSONObj)
    case is List:
      return convertArray(obj as! List)
    case is NSData:
        return NSDataBridge.store(obj as! NSData)
    default:
      return obj
    }
  }
}