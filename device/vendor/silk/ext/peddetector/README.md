### How to obtain the pedestrian model

```
git clone git@github.com:silklabs/dnn-models.git
cd dnn-models/pedestrian
make
```

##### For device
```
adb push caltech10x_warp_finetune_train_iter_100000 /system/media/dnn/model/ped
```

##### For simulator
```
pushd sim/system/silk/media/dnn/model/ped
ln -sf <dnn-models/pedestrian>/caltech10x_warp_finetune_train_iter_100000 caltech10x_warp_finetune_train_iter_100000
popd
```
