# Silk Gonk Build [![Build Status](https://magnum.travis-ci.com/silklabs/silk-device.svg?token=9zqxLJky1XFHahNndToB)](https://magnum.travis-ci.com/silklabs/silk-device)


## Configuring a device

### Mako

First load the device with the stock Nexus 4 5.1.1 (LMY47V) ROM from
https://dl.google.com/dl/android/aosp/occam-lmy47v-factory-b0c4eb3d.tgz and
ensure the device is functioning normally.

Then obtain the latest Silk Nexus 4 ROM:

```
$ wget https://s3-us-west-2.amazonaws.com/silk-device/master/latest/mako.tgz
$ tar zxf mako.tgz
$ cd aosp_mako/
$ ./flash.sh
```

### Shamu

First load the device with the stock Nexus 6 (LMY47Z) ROM from
https://dl.google.com/dl/android/aosp/shamu-lmy47z-factory-33951732.tgz
and ensure the device is functioning normally.

Enable the boot loader to be unlocked by:

1. Settings -> About phone -> Tap on "Build number" 10 times
2. Back to Developer options and enable "OEM unlocking"

Then obtain the latest Silk Nexus 6 ROM ("shamu-*") from [Google Docs](https://drive.google.com/a/weavelabs.net/folderview?id=0B1uhMYctsSarfmI3ZnJKNXdaOEtTM3VubHVDcEdIZ05VblNuWU81YkZ6X0NtcUU4MU9CWUE&usp=sharing)

After downloading and uncompressing the image, execute the following to flash
your device:
```
$ cd shamu-2015-05-16_194249/  # or whatever the archive is called
$ ./flash.sh
```

Expect to be stuck on the [Twiddling Antenna Android
"Erasing..."](http://www.reddit.com/r/nexus6/comments/2nflmb/my_nexus_6_is_stuck_on_erasing/)
for 10-20 minutes upon your first flash.  You will need to manually reflash
`userdata.img` once the Erasing screen is complete (or easier, run `./flash.sh` again)

## Building for Dummies

NOTE: You _must_ have a case sensitive file system.  To create one,

0. Open Disk Utility (Cmd-space then type "disk utility")
0. Select New -> Blank Disk Image
0. For "Name", choose "Silk" or something without spaces
0. For "Size", choose Custom -- 10 GB
0. "Format": Case-sensitive; Journaled
0. "Image Format": "sparse disk image"

Finally press "Create" and your new disk will mount at `/Volumes/Silk` (or whatever you named it).

0. ```. build/envsetup.sh``` -- not strictly required, but it'll save you ~4 seconds on every incremential build if you elect to run this before ```make```
1. ```make``` -- downloads and builds the target binaries
2. ```make install``` -- installs the build products onto a device

## Connecting to the server

By default the build will connect to the test server at
https://silk-test-server.herokuapp.com/.

If you would like to use a local server for development purposes or otherwise,
configure the device with:

```
$ adb shell setprop persist.silk.server.url http://192.168.0.3:5000/
$ adb shell setprop ctl.restart silk
```
This information is persisted in `/data/property/`. To revert back to the
production server:

```
$ adb shell setprop persist.silk.server.url ""
$ adb shell setprop ctl.restart silk
```


## Activating the full gonk environment

```
$ . build/envsetup.sh
```

Now you may ```godir``` and ```mm``` around.  ```adb sync``` works here
too.

## Building the full Mako image

The default gonk environment is 'base', which is a minimal environment for
building just the Silk userspace components.  This setup requires a configured
device (only Mako at the moment, maybe the emulator soon) to work against.

It's also possible to build a full Mako device image from the tree as well:

```
$ make clean
$ make init.mako
$ make
```

Then flash the full image with:
```
fastboot flashall
```

Creating a new device archive is accomplished by running:
```
$ . build/envsetup.sh
$ gonk/mako/archive.sh <archive_dir>
```

The full device manifest is located at
https://github.com/silklabs/device-lge-mako-manifest.

## Building the full Shamu image

Same as Mako, but using `make init.shamu`.

## Updating a gonk patch

Patch trees are seperated by gonk, and can be found at ```gonk/<name>/patch/```.

An example of updating a patch for the "base" gonk:
```bash
cd external/node
# <hack hack>
git commit -m "New patch"
git format-patch HEAD^
cp *.patch ../../gonk/base/patch/external/node
# <note that the next time |. build/envsetup.sh| is run the patches will be reapplied>
```

## Automated build and test

Builds and tests run on travis-ci.  See current status [here](https://magnum.travis-ci.com/silklabs/silk-device), and also in pull requests that you open.

Travis-ci builds run on linux, Ubuntu 12.04 amd64 machines.  If a build burns only there, you'll usually want to start diagnosing by reproducing on a VM image with similar config:

https://drive.google.com/a/silklabs.net/folderview?id=0B5U_FixPxut_flpZT2ZuOWV6U3ExZUVwMEZqdGZzazcyNHRSU2pJRWJHRFRYQ0dCSEQ2aXM&usp=sharing

## Emacs setup

If you don't use emacs, ignore this.

JavaScript files are tagged to use js2-mode.  [Follow these instructions to install js2-mode](https://github.com/mooz/js2-mode).

## Development ProTips

We run eslint on core ES6 files.  It's great for finding bugs but can be annoying during development when it fails builds because of trailing whitespace and so forth.  When iterating during development, you can turn off eslint checking by passing `LAX=1` to make:
```bash
make LAX=1 core.js
```
Remember to run a non-LAX build before sending a pull request though!

## Appendix


### Stock device manifest for Nexus 4 ("Mako") 5.1.1

```
$ repo init -u https://android.googlesource.com/platform/manifest.git -b android-5.1.1
$ repo sync -j4 --current-branch --no-tags
$ . build/envsetup
$ lunch aosp_mako-eng
$ time make -j8
```

### Recovery image

A nice recovery image is available at [openrecovery-twrp-2.8.5.2-mako.img](https://drive.google.com/a/weavelabs.net/file/d/0B1uhMYctsSarZ2d1VFFiNmMyeE0/view?usp=sharing)

```
$ adb reboot-bootloader
$ fastboot oem unlock
$ fastboot boot openrecovery-twrp-2.8.5.2-mako.img
```
