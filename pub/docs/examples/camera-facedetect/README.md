# silk-camera-facedetect
Demo of basic face detection using Silk

# Usage
1. Flash the device with the latest Silk platform
2. `silk run`
3. When the face is detected, the camera frame will be saved to `/data/face_xxx.png` on device.
Use `adb shell ls /data/` to see the list of the files generated and then Use `adb pull /data/face_xxx.png` to retrieve it, where `xxx` varies from one file to another.
