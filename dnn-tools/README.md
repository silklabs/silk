##### faceGtConvertor
This tool converts the annotations (ground truth) format from [FDDB](http://vis-www.cs.umass.edu/fddb/index.html) faces dataset to the [format](http://vision.ucsd.edu/~pdollar/toolbox/doc/detector/bbGt.html) required by the model evaluator `evaulator/dbEval`.

```
./faceGtConvertor.js <path to FDDB annotations files> <path to the destination>
```

To also see the annotations on the test images, run
```
./faceGtConvertor.js <path to FDDB annotations files> <path to the destination> true <path to test images>
```
