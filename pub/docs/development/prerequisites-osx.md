# Prerequisites (OS X)

**Below is the list of prerequisites for building Silk on OS X.**

**NOTE**: the Disk Utility in at least OS X El Capitan 10.11.3 is no longer able to create case-sensitive file systems within disk images, when you explicitly ask it to.  So instead you must create your disk image using the workaround below.

0. You _must_ have a case sensitive file system to build on OS X.  To create one, navigate to the directory where you want to store the image, and then run the following command:
```
hdiutil create -type SPARSE -fs 'Case-sensitive Journaled HFS+' -size 30g -volname ${VOLNAME} ${IMAGENAME}
```
replacing `VOLNAME` and `IMAGENAME` with the names you want for the volume and sparse disk image file, respectively.
0. Install Xcode command line tools by going to App Store and installing Xcode
0. Install [Java SDK 7.x](http://www.oracle.com/technetwork/java/javase/downloads/jdk7-downloads-1880260.html)
0. Install Node by running |brew install node|

**Tip**: Sparse disk can grow in size as needed automatically when you add files to the image. However they don't shrink in size when you remove files. Every now and then you would need to compact the disk to reclaim the disk space. The tool such as Free DMG does a good job at that. Open the tool, go to images menu and click on compact.

Once you're done, continue to the [building instructions](build-instructions-linux-osx.md).
