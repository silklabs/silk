extension NSData {

  /**
   * Convert a NSData type to a hexidecimal string
   */
  var hexString: String {
    let buf = UnsafePointer<UInt8>(bytes)
    let charA = UInt8(UnicodeScalar("a").value)
    let char0 = UInt8(UnicodeScalar("0").value)

    func itoh(i: UInt8) -> UInt8 {
      return (i > 9) ? (charA + i - 10) : (char0 + i)
    }

    let p = UnsafeMutablePointer<UInt8>.alloc(length * 2)

    for i in 0..<length {
      p[i*2] = itoh((buf[i] >> 4) & 0xF)
      p[i*2+1] = itoh(buf[i] & 0xF)
    }

    return String(NSString(bytesNoCopy: p, length: length*2, encoding: NSUTF8StringEncoding, freeWhenDone: true)!)
  }
}