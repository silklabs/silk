/**
 * Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved. Confidential and
 * Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

type YoloBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  probs: Array<number>;
};

export type ObjectBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  prob: number;
};

function overlap(x1: number, w1: number, x2: number, w2: number): number {
  let l1 = x1 - w1 / 2;
  let l2 = x2 - w2 / 2;
  let left = l1 > l2 ? l1 : l2;
  let r1 = x1 + w1 / 2;
  let r2 = x2 + w2 / 2;
  let right = r1 < r2 ? r1 : r2;
  return right - left;
}

function boxIntersection(a: YoloBox, b: YoloBox): number {
  let w = overlap(a.x, a.width, b.x, b.width);
  let h = overlap(a.y, a.height, b.y, b.height);
  if (w < 0 || h < 0) {
    return 0;
  }
  let area = w * h;
  return area;
}

function boxUnion(a: YoloBox, b: YoloBox): number {
  let i = boxIntersection(a, b);
  let u = a.width * a.height + b.width * b.height - i;
  return u;
}

function boxIou(a: YoloBox, b: YoloBox): number {
  return boxIntersection(a, b) / boxUnion(a, b);
}

// Max intersection over box area
function maxBoxIoa(a: YoloBox, b: YoloBox): number {
  let ioaa = boxIntersection(a, b) / (a.width * a.height);
  let ioab = boxIntersection(a, b) / (b.width * b.height);
  return Math.max(ioaa, ioab);
}

function nmsSort(boxes: Array<YoloBox>, labels: Array<string>, iouThresh: number,
    ioaThresh: number) {
  labels.forEach((_, k) => {
    // Sort boxes by probability for class k
    boxes.sort((a, b) => b.probs[k] - a.probs[k]);
    for (let i = 0; i < boxes.length; ++i) {
      // Once we reach 0, we are done (boxes are in decreasing probability
      // order)
      if (!boxes[i].probs[k]) {
        break;
      }
      for (let j = i + 1; j < boxes.length; ++j) {
        // again, 0 probability means we are done here as well
        if (!boxes[j].probs[k]) {
          break;
        }
        if (boxIou(boxes[i], boxes[j]) > iouThresh ||
            maxBoxIoa(boxes[i], boxes[j]) > ioaThresh) {
          boxes[j].probs[k] = 0;
        }
      }
    }
  });
}

function calculateBoxes(predictions: Array<number>, labels: Array<string>,
    num: number, square: boolean, side: number, thresh: number,
    onlyObjectness: boolean): Array<YoloBox> {
  const classes = labels.length;
  let boxes = [];
  for (let i = 0; i < side * side; ++i){
    let row = Math.floor(i / side);
    let col = i % side;
    for (let n = 0; n < num; ++n) {
      let index = i * num + n;
      let pIndex = side * side * classes + i * num + n;
      let scale = predictions[pIndex];
      let boxIndex = side * side * (classes + num) + (i * num + n) * 4;
      let probs = [];
      boxes[index] = {
        x: (predictions[boxIndex + 0] + col) / side,
        y: (predictions[boxIndex + 1] + row) / side,
        width: Math.pow(predictions[boxIndex + 2], (square ? 2 : 1)),
        height: Math.pow(predictions[boxIndex + 3], (square ? 2 : 1)),
        probs: probs,
      };
      labels.forEach((_, j) => {
        let classIndex = i * classes;
        let prob = scale * predictions[classIndex + j];
        probs[j] = (prob > thresh) ? prob : 0;
      });
      if (onlyObjectness) {
        probs[0] = scale;
      }
    }
  }
  return boxes;
}

function filterBoxes(boxes: Array<YoloBox>, labels: Array<string>, w: number,
    h: number): Array<ObjectBox> {
  let results = [];
  boxes.forEach(box => {
    let xmin = box.x - box.width / 2.;
    let xmax = box.x + box.width / 2.;
    let ymin = box.y - box.height / 2.;
    let ymax = box.y + box.height / 2.;

    if (xmin < 0) {
      xmin = 0;
    }
    if (ymin < 0) {
      ymin = 0;
    }
    if (xmax > w) {
      xmax = w;
    }
    if (ymax > h) {
      ymax = h;
    }

    box.probs.forEach((p, n) => {
      if (p) {
        results.push({ x: xmin * w, y: ymin * h, width: (xmax - xmin) * w,
          height: (ymax - ymin) * h, label: labels[n], prob: p });
      }
    });
  });
  return results;
}

// Calculate yolo boxes from the supplied predictions (last FC layer of the
// network).
// predictions: array of side * side * (classes + num) + side * side * num * 4
// float values [0, 1]
// labels: array of labels (yolo uses 20 by default)
// side: number of rects in width and height direction (default is 7)
// probThresh: probability threshold, predictions below this probability are
// dropped altogether
// nmsIouThresh: non-maximum suppression iou threshold (default is 0.4)
// nmsIoaThresh: non-maximum supression ioa threshold (default is 0.75)
// imageWidth: width of the image since we predict based on [0,1]
// imageHeight: height of the image
// Return: an array of predicted boxes, within image
export default function predictionsToBoxes(predictions: Array<number>,
    labels: Array<string>, num: number, side: number, probThresh: number,
    nmsIouThresh: number, nmsIoaThresh: number, imageWidth: number,
    imageHeight: number): Array<ObjectBox> {
  let boxes = calculateBoxes(predictions, labels, num, true, side, probThresh, false);
  nmsSort(boxes, labels, nmsIouThresh, nmsIoaThresh);
  return filterBoxes(boxes, labels, imageWidth, imageHeight);
}
