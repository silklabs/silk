`dbEval.js` is a tool to measure the accuracy of a model. This model evaluator is based on the [matlab implementation](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/code/code3.2.1.zip)
of [PAMI 2012](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/files/PAMI12pedestrians.pdf) paper.

#### Prerequisites

```
npm install
```

##### Annotations (ground truth)
Annotation files for UsaTest (caltech pedestrian) are extracted using `dbExtract` matlab tool that can be downloaded at
[Matlab evaluation/labeling code](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/code/code3.2.1.zip).
For convenience the extracted annotations files for `UsaTest` and `FDDB` are available at [silk-dnn](https://github.com/silklabs/silk-dnn/tree/master/dataset).

##### Detection results
Detection results for `UsaTest` for algorithm `SCF+AlexNet` can be downloaded from [Caltech Pedestrians website](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/datasets/USA/res/SCF+AlexNet.zip). Detection results for `FDDB` can be obtained by running [FacePredictor](https://github.com/silklabs/silk-core/tree/master/device/vendor/silk/ext/face/tools) tool.


#### How to run model evaluator
```
node dbEval.js gtPath dtPath databaseName

where,
    gtPath: Directory containing annotation files
    dtPath: Directory containing detection files
    databaseName: Name of the dataset to use. Supported datasets are 'UsaTest' and 
                  'FDDB'. One can specify a subset of a dataset by appending digits
                  to the end of the name (eg. 'UsaTest01' indicates first set of
                  'UsaTest' and 'UsaTest01005' indicate first set, fifth video and
                  'FDDB01001' for first set first fold of FDDB data set).
```

**Note**: Directory structure containing annotation and detection files for each dataset is different.

For example,
```
node dbEval.js <path-to-silk-dnn/dataset/pedestrian/caltech/annotations> <point_to_dir_containing_detection_results>  UsaTest

node dbEval.js <path-to-silk-dnn/dataset/faces/FDDB/annotations> <point_to_dir_containing_detection_results>  FDDB

```

#### Differences from the matlab implementation
* Dataset is evaluated only for one algorithm at a time 
(default `SCF+AlexNet` based on [Taking a Deeper Look at Pedestrians](http://arxiv.org/abs/1501.05790))
* This tool doesn't draw the ROC curve unlike the matlab version
* This tool doesn't read annotation vbb files (as vbb files are stored as matlab matrix). Instead this tool reads
the annotation files extracted under `dataset` folder.
