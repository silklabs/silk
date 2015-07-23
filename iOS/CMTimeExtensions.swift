import CoreMedia

extension CMTime {
  /**
  Get utc time in milliseconds
  */
  func milliseconds() -> Int {
    return Int(
      Float(self.value) / Float(self.timescale) * 1000
    )
  }
}