## How to train the device to recognize you
Set the following android property to ask device to take your headshots and use as a training set
```
adb shell setprop silk.addperson "<Name>" (Whatever name you want device to identify you with)
```
Trainer is set to take 100 images of a person with each new image different than the previous
one by a certain threshold and at the rate of at most one image a second. This is done to make
sure the image set is varied enough to provide a good training set. This may take some time so
please be patient.

* Start by standing next to the device and then gradually move away from the device. This is to
help the recognizer detect faces at different distances from the device.
* Please make sure that the entire face is visible in the frame. It helps if silk-app is running
on the side to guide during training.
* Side faces don't work very well so please make sure you are looking straight at the device.
* Take a few images with different expressions like frowining, smiling, etc.
* If possible move around with the device while taking images to capture images during different
light conditions.
* Once the training set is complete, you can pull it out of the device and store in
https://github.com/silklabs/silk-trainingset to be available by default on all the FUT devices
```
adb pull /data/silk/opencv/faces/<Name> ~/Desktop/<Name>
```

#### Limitations
* If a light is falling straight on the face the recognizer doesn't work very well.
* Face recognizer doesn't work very well in low light conditions and is error prone.
