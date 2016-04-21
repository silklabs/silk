This tool uses the `lib/FaceDetector.js` to predict faces on [FDDB](http://vis-www.cs.umass.edu/fddb/) dataset and store
the detection results in the specified destination folder.

#### Prerequisites

```
cd silk-core/device/vendor/silk/ext/face
npm install
ANDROID_BUILD_TOP=<absolute-path-to/silk-core/device/>  bin/pretest
```

#### How to run the tool

```
npm run predict <fileListPath> <dbPath> <dest> <show>

where,
    fileListPath : Directory containing the list of files for each FDDB fold
    dbPath       : Directory containing original set of test images
    dest         : Directory to store the detection files
    [show]       : Show annotations on the test images
```
If `show` option is specified then each FDDB image is annotated with weak faces in red color and strong faces in green color inside a new `tmp` directory.

* `weak` - Only haar was able to find the face
* `strong` - Both haar and hog were able to find the face

#### Next steps
Once the detection results on FDDB data set is available, run the [evaluator tool](https://github.com/silklabs/silk-core/tree/master/dnn-tools/evaluator) to check the accuracy of `lib/FaceDetector.js`

