/**
 * Attempts to filter signal from noise in RSSI samples.  See long
 * comment below.
 */
export default class RssiSmoother {
  // MIN/MAX rssi readings (dbM) that drivers will report (neither is
  // ever seen in practice).
  static MIN_RSSI = -100;
  static MAX_RSSI = 0;
  // RSSI returned when there are no samples available to process.
  static DEFAULT_RSSI = -80;
  // How "old" the oldest sample we'll process can be.  An older
  // max-age makes processed values "smoother", but slow to respond to
  // real changes in signal strength.  A younger max-age is more
  // responsive at the expense of "less smooth".
  static MAX_AGE_MS = 1000;
  // See long comment below.
  static COUNT_THRESHOLD = 0.1;

  _samples = [ ];                // [ { timeMs, rssi } ]

  _histogram(now) {
    let minTimeMs = now - RssiSmoother.MAX_AGE_MS;
    this._samples = this._samples.filter(s => minTimeMs <= s.timeMs);
    if (0 === this._samples.length) {
      return null;
    }

    let h = { };
    h.nrSamples = this._samples.length;
    h.min = this._samples.reduce((a, s) => Math.min(a, s.rssi),
                                RssiSmoother.MAX_RSSI);
    h.max = this._samples.reduce((a, s) => Math.max(a, s.rssi),
                                RssiSmoother.MIN_RSSI);
    h.buckets = new Array(1 + h.max - h.min);
    h.buckets.fill(0);
    this._samples.forEach(s => ++h.buckets[s.rssi]);
    return h;
  }

  get value() {
    let histogram = this._histogram(Date.now());
    if (!histogram) {
      return RssiSmoother.DEFAULT_RSSI;
    }
    //
    // The array |histogram| of samples from |[min, max]| (array
    // indices |[0, histogram.length - 1]|, respectively) is assumed
    // store samples from a set of unknown normal distributions.  This
    // function attempts to infer the distribution with the maximum
    // mean and then returns that mean.
    //
    // Given an approximation formula for the CDF of the normal
    // distribution, it's possible in theory to set up a system of
    // equations for the distribution's mean and standard deviation
    // given a histogram "bucket" (i.e. the difference between the CDF
    // at the right edge of the bucket and left edge).  Then solving
    // these equations across a couple of successive buckets should
    // enable a more accurate estimation of sample mean.  However,
    // after several pages of equation scrawl, cjones couldn't make
    // the equations boil away to something with a nice closed-form
    // solution.
    //
    // So instead, we use an incredibly dumb algorithm that "climbs"
    // the distributions as discretized in the histogram, then
    // estimates the mean of the max distribution to be the last
    // bucket value seen before the first "drop" in the distribution
    // "climb".
    //
    // It might be possible to combine these approaches into a more
    // accurate algorithm that "climbs" the distribution, but uses the
    // climb to estimate the instantaneous derivatives of the
    // distribution, then uses the derivative estimates to compute
    // where the derivative should have been zero (i.e. at the mean).
    //
    // With any algorithm, we ensure that a threshold of samples have
    // been examined before returning an estimated mean.  Currently
    // that threshold is 10%.
    //
    // This algorithm doesn't weight more recent samples higher than
    // older in order to be more responsive to signal changes.  That
    // could be done relatively easily.
    //
    let lastBucketCount = 0;
    let totalCountedSamples = 0;
    let rssi;
    for (rssi = histogram.max; rssi > histogram.min; --rssi) {
      var count = histogram.buckets[rssi - histogram.min];
      if (lastBucketCount <= count) {
        totalCountedSamples += count;
        lastBucketCount = count;
        continue;
      }
      if (totalCountedSamples / histogram.nrSamples >= RssiSmoother.COUNT_THRESHOLD) {
        rssi += 1;
        break;
      }
    }
    return rssi;
  }

  update(rssi) {
    this._samples.push({ timeMs: Date.now(), rssi });
  }
}
