/**
 * @providesModule silk-cv
 * @flow
 */

/**
 * Type representing a rectangle
 *
 * @property x x co-ordinate of the rectangle
 * @property y y co-ordinate of the rectangle
 * @property width width of the rectangle
 * @property height height of the rectangle
 */
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};


type Options = {
  drawPoints?: bool;
};

type Matrix = any; // OpenCV grayscale matrix

type FrameResults = {
  confidence: number;
  angle: number;
  size: {
    width: number;
    height: number;
  }
  boundingRect: Rect;
};

declare class Cmt {

  constructor(
    trainingFrame: Matrix,
    objectRect: Rect,
    initializedCallback: Function,
    options?: Options
  ): any;

  nextFrame(
    frame: Matrix,
    processedCallback: (err: ?Error, results: ?FrameResults) => void,
  ): void;

  busy(): bool;
};

declare var cmt: Cmt;
declare export default typeof cmt;
