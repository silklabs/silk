/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import {
  Matrix,
  FaceRect,
} from './face';

export default function safeRoi(frame: Matrix, rect: FaceRect): Matrix {
  // rect must be fully contained within the frame or OpenCV will
  // assert within the |.roi| method.
  if (rect.x < 0) {
    rect.width += rect.x;
    rect.x = 0;
  }
  if (rect.y < 0) {
    rect.height += rect.y;
    rect.y = 0;
  }
  const [maxHeight, maxWidth] = frame.size();
  if (rect.x + rect.width >= maxWidth) {
    rect.width = maxWidth - rect.x;
  }
  if (rect.y + rect.height >= maxHeight) {
    rect.height = maxHeight - rect.y;
  }
  return frame.roi(rect.x, rect.y, rect.width, rect.height);
}

