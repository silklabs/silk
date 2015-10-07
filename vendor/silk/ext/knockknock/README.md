## How to train the device to recognize you
Set the following android property to ask device to take your headshots and use as a training set
```
adb shell setprop silk.addperson "<Name>" (Whatever name you want device to identify you with)
```
* Sit close to the device and make sure you entire face is visible in the frame. It helps if you
have the app running on the side to guide you while you are training.
* Side faces don't work very well yet so please make sure you are looking straight at the device.
* Take a few pictures with different expressions like frowining, smiling, etc.
* Also encourage to take few such sets in different light conditions such as during the afternoon
light and in the evening.
* Once the training set is complete, you can pull it out of the device and store in
https://github.com/silklabs/silk-trainingset to be available by default on all the FUT devices
```
adb pull /data/silk/opencv/faces/<Name> ~/Desktop/<Name>
```

#### Limitations
* If a light is falling on your face the recognizer doesn't work very well.
* Face recognizer doesn't work well in low light conditions and is very error prone.
