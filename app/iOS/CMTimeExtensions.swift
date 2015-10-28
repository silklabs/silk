import CoreMedia

extension CMTime {
  /**
  Get utc time in milliseconds
  */
  func milliseconds() -> Int {
    let value = self.value
    let timescale = self.timescale

    if timescale == 0 {
      return Int(self.value / 1000)
    }

    return Int(
      Float(value) / Float(timescale) * 1000
    )
  }
}