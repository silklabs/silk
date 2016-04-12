`dbEval.js` is a tool to measure the accuracy of a model. This model evaluator is based on the [matlab implementation](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/code/code3.2.1.zip)
of [PAMI 2012](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/files/PAMI12pedestrians.pdf) paper.

#### How to run model evaluator
```
node dbEval.js [dataset_location] [dataset_name]
```

For example,
```
node dbEval.js ../../../silk-dnn/dataset/pedestrian/caltech/ UsaTest
```

#### Prerequisites
##### Directory structure
Model evaluator requires the Caltech pedestrian dataset to be in a specific format
```
caltech
       |
       --annotations
       |           |
       |           -- setxx
       |                   |
       |                   --VXXX
       |
       --res
           |
           --SCF+AlexNet
                       |
                        -- setxx
```

##### Annotations (ground truth)
Annotation files are extracted using `dbExtract` matlab tool that can be downloaded at
[Matlab evaluation/labeling code](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/code/code3.2.1.zip).
For convenience the extracted annotations files are available under `dataset` folder in `silk-dnn` repository.

##### Detection results
Detection results for `SCF+AlexNet` can be downloaded from [Caltech Pedestrians website](http://www.vision.caltech.edu/Image_Datasets/CaltechPedestrians/datasets/USA/res/SCF+AlexNet.zip).
Unzip the downloaded file at `<dataset_location>/res` to maintain the directory structure above.

#### Differences from the matlab implementation
* Dataset is evaluated only for one algorithm at a time 
(default `SCF+AlexNet` based on [Taking a Deeper Look at Pedestrians](http://arxiv.org/abs/1501.05790))
* This tool doesn't draw the ROC curve unlike the matlab version
* This tool doesn't read annotation vbb files (as vbb files are stored as matlab matrix). Instead this tool reads
the annotation files extracted under `dataset` folder.
