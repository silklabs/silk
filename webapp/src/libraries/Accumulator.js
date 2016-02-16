
/**
 * Accumulate sequences of values and compute statistics over the
 * values.
 */
export default class Accumulator {
  name: string = '???Accumulator';
  roundingFactor: number;
  min: number = Infinity;
  max: number = -Infinity;
  count: number = 0;

  /**
   * `sigDecimals` says how many decimal places to consider
   * significant when computing changed summary statistics like
   * max/min.  For example, `sigDecimals = 2` means that after the
   * sequence of values [ 0.1, 0.2, 0.23, 0.234 ] is accumulated, then
   * the max will be 0.23.
   */
  constructor(name, sigDecimals = 2) {
    this.name = name;
    this.roundingFactor = Math.pow(10, sigDecimals);
  }

  /**
   * Accumulate `samples` into the series, which can be an array or number.
   */
  accumulate(samples) {
    if ('number' === typeof samples) {
      samples = [ samples ];
    }
    let [ min, max ] = [ this._round(Math.min(...samples)),
                         this._round(Math.max(...samples)) ];
    this.count += samples.length;
    if (min < this.min) {
      this.min = min;
      this.report();
    }
    if (max > this.max) {
      this.max = max;
      this.report();
    }
  }

  /**
   * Dump summary statistics into `console.log()`.
   */
  report() {
    console.log(`${this.name} stats: min:${this.min} max:${this.max} (total:${this.count})`);
  }

  _round(x) {
    let factor = this.roundingFactor;
    return Math.round(factor * x) / factor;
  }
}
