'use strict';

import assert from 'assert';
import cv from 'opencv';
import fs from 'fs';
import path from 'path';
import silkcv from '..';
import mkdirp from 'mkdirp-promise';

type Matrix = any;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

class TrackingSequence {

  constructor(dataset: string, resultPrefix: string) {
    this._resultPrefix = resultPrefix;

    this._files = fs.readdirSync(dataset)
      .filter(filename => ['.jpg', '.png'].includes(filename.substr(-4)))
      .sort()
      .map(filename => path.join(dataset, filename));

    assert(this._files.length > 0);

    this._startRect = JSON.parse(fs.readFileSync(path.join(dataset, 'rect.json'), 'utf8'));
  }

  _readImage(filename: string): Promise<Matrix> {
    return new Promise((resolve, reject) => {
      cv.readImage(filename, (err, im) => {
        if (err) {
          reject(err);
        } else {
          im.convertGrayscale();
          resolve(im);
        }
      });
    });
  }

  // Start the sequence
  async start(): [Matrix, Rect] {
    let im = await this.next();
    assert(im !== null);
    return [im, this._startRect];
  }

  // Advances to the next frame in the sequence. Null if at the end.
  async next(): ?Matrix {
    if (this._im) {
      this._im.release();
    }
    if (this._files.length === 0) {
      return null;
    }
    const filename = this._files.shift();
    let im = await this._readImage(filename);
    console.log('Loaded', filename);
    this._im = im;
    this._basename = path.basename(filename, filename.substr(-4));
    return im;
  }

  // Records the tracking result for the current frame the sequence
  nextResult(found: bool, rect: Rect, confidence: number) {
    if (!found) {
      console.log('Tracking lost with confidence:', confidence);
      assert(false);
    }
    console.log('Tracked with confidence', confidence, 'to', JSON.stringify(rect));
    let output = this._im.copy();
    output.rectangle([rect.x, rect.y], [rect.width, rect.height], null, 5);
    output.save(`${this._resultPrefix}${this._basename}.png`);
    output.release();
  }
}


suite('Tracker', () => {
  const trackers = ['DLIB', 'CMT'];

  const datadir = path.join(__dirname, 'fixtures', 'trackingData');

  const datasets = fs.readdirSync(datadir)
    .sort()
    .map(filename => path.join(datadir, filename))
    .filter(filename => fs.statSync(filename).isDirectory());
  console.log('Found dataSets:', datasets);

  trackers.forEach(trackerClass => {
    datasets.forEach(dataset => {
      test(trackerClass + ' ' + path.basename(dataset), async () => {

        const outputDir = `${__dirname}/output/${trackerClass}/${path.basename(dataset)}/`;
        await mkdirp(outputDir);

        let seq = new TrackingSequence(dataset, outputDir);

        let [image, rect] = await seq.start();

        let tracker = await new Promise(
          resolve => {
            let newTracker = new silkcv.Tracker(
              trackerClass,
              image,
              rect,
              err => {
                assert(!err, err);
                resolve(newTracker);
              }
            );
          }
        );

        while (true) {
          let nextImage = await seq.next();
          if (nextImage === null) {
            break;
          }
          assert(!tracker.busy(), 'Tracker not expected to be busy');

          seq.nextResult(... await new Promise(
            (resolve, reject) => {
              tracker.update(
                nextImage,
                (err, found, rect, confidence) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve([found, rect, confidence]);
                  }
                },
              );
            }
          ));
        }
      });
    });
  });
});
