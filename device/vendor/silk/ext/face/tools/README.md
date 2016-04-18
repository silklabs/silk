#### Prerequisites

```
cd silk-core
source build/setup
cd vendor/silk/ext/face
./bin/pretest
```

#### How to run face_evaulator

```
npm run predict <fddbFileListPath> <dbPath> <dest>

```

If you would like to see the detection results on the input images
```
npm run predict <fddbFileListPath> <dbPath> <dest> true

```
This will create a directory called as `tmp` from where the above command is run
and mark all the weak faces with red color and strong faces with green color.

* `weak` - Only haar was able to find the face
* `strong` - Both haar and hog were able to find the face

