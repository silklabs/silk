# Silk Gonk Build [![Build Status](https://magnum.travis-ci.com/silklabs/silk-device.svg?token=9zqxLJky1XFHahNndToB)](https://magnum.travis-ci.com/silklabs/silk-device)

## Configuring Nexus 4 (Mako)

First load the device with the stock Nexus 4 5.1.1 (LMY47V) ROM from
https://dl.google.com/dl/android/aosp/occam-lmy47v-factory-b0c4eb3d.tgz and
ensure the device is functioning normally.  It's only necessary to perform this
step once when you first acquire the device.

Then obtain the latest Silk Nexus 4 ROM and flash it with:

```
$ wget https://s3-us-west-2.amazonaws.com/silk-device/master/latest/mako.tgz
$ tar zxf mako.tgz
$ cd aosp_mako/
$ ./flash.sh
```
or if you already have a workspace simply run:
```
$ make update
```

Check the latest green build at
https://magnum.travis-ci.com/silklabs/silk-device/builds to figure what
**mako.tgz** currently contains.

If the device is intended to be used as a dogfooding device, use
`./flash_fut.sh` instead of `./flash.sh` (not recommended for development as
updates are enabled in the FUT build), shortcut for this:

```
$ make fut
```

## Prerequisites
0. You _must_ have a case sensitive file system to build on OS X.  To create one,
  0. Open Disk Utility (Cmd-space then type "disk utility")
  0. Select New -> Blank Disk Image
  0. For "Name", choose "Silk" or something without spaces
  0. For "Size", choose Custom -- 10 GB
  0. "Format": Case-sensitive; Journaled
  0. "Image Format": "sparse disk image"
  0. Finally press "Create" and your new disk will mount at `/Volumes/Silk` (or whatever you named it).
0. Make sure that your [SSH key](https://help.github.com/articles/generating-ssh-keys/) is added to your github account.
0. Install Xcode command line tools by going to App Store and installing Xcode
0. Install [Java SDK 7.x](http://www.oracle.com/technetwork/java/javase/downloads/jdk7-downloads-1880260.html)
0. Install Node by running |brew install node|

## Syncing
0. Follow instructions at [fork a repo](https://help.github.com/articles/fork-a-repo/) to fork and clone the git repository.

## Building
```
  $make # <-- downloads (if necessary) and builds the target binaries
  $make install # <-- installs the build products onto a device
```

If you'd like to use the emulator instead of a real device, start the emulator
with `make qemu` before running `make install`.

### Updating your workspace

1.  `git pull --rebase` => updates silk-device proper
2. `make sync` => updates the workspace to reflect any gonk manifest changes that were pulled in as a part of (1)

### Cleaning your workspace

In most cases all you need to do is `make clean`.  This preserves any manifest
projects downloaded into the `.repo/` directory by `make sync`

If you really want to restore your workspace back to its pristine state run
`make zest`.

## Connecting to the server

By default the build will connect to the test server at
https://silk-server-master.herokuapp.com/.  You can view live cameras in your
desktop browser by navigating to https://silk-webapp-master.herokuapp.com.

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

## Debugging

### C/C++

The `./rungdb` script will setup a gdb session to the program or process of your
choice. Some examples:

```
$ ./rungdb program_name
$ ./rungdb attach <pid>
$ ./rungdb attach program_name
```

### Javascript

Please refer to the debugging details [here](vendor/silk/core/README.md).

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

IMPORTANT: The full Mako image is not currently supported on OS X.  Use a Linux
VM instead.  Instructions for setting up your VM are at
https://github.com/silklabs/silk-device/wiki/Prerequisites--for-full-Mako-build

It's also possible to build a full Mako device image from the tree as well:

```
$ make clean
$ make init.mako
$ make
```

Then flash the full image with
```
$ . build/envsetup.sh
$ fastboot flashall -w  # <-- Only add "-w" if you want to wipe /data and /cache
```

Creating a new device archive is accomplished by running `make dist`

## Building the full Emulator image

Same as Mako but use `make init.qemu` instead.

## Building the full Shamu image

Same as Mako but use `make init.shamu` instead.

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

Builds and tests run on travis-ci.  See current status
[here](https://magnum.travis-ci.com/silklabs/silk-device), and also in pull
requests that you open.

Travis-ci builds run on linux, Ubuntu 12.04 amd64 machines.  If a build burns
only there (very rare), you'll usually want to start diagnosing by reproducing in your Linux
VM image.

### Artifacts

In addition to the traditional artifacts travis produces (the log) you
can find addition logs by searching for the "artifacts url" line in your travis
build. This url will show you additional artifacts available for
debugging (full log, etc...).

To add additional artifacts add files to the `.artifacts` directory from
the travis build.

## Emacs setup

If you don't use emacs, ignore this.

JavaScript files are tagged to use js2-mode.  [Follow these instructions to install js2-mode](https://github.com/mooz/js2-mode).

## Development ProTips

### Suppressing ESLint

We run eslint on core ES6 files.  It's great for finding bugs but can be
annoying during development when it fails builds because of trailing whitespace
and so forth.  When iterating during development, you can turn off eslint
checking by passing `LAX=1` to make:
```bash
make LAX=1 core
```

Remember to run a non-LAX build before sending a pull request though!

### Tombstones

When a native process crashes bionic (via debuggerd) will engrave a tombstone
of it in /data/tombstones/, useful for determining what happened if you didn't
happen to have gdb attached at the time.

To symbolize a tombstone run:
```
$ adb pull /data/tombstones/
$ . build/envsetup.sh
$ ./development/scripts/stack tombstone_00
```

### Core dumps

To enable core dumps for the main silk process,
run `adb shell setprop persist.silk.coredump 1` and then restart.
The dumps will be placed in /data/core.

```
$ adb pull /data/core/
$ . build/envsetup.sh
$ ./rungdb node node.12205.1443030071.core #<-- "12205.1443030071" will vary
```

## Appendix

### Stock device manifest for Nexus 4 ("Mako") 5.1.1

```
$ repo init -u https://android.googlesource.com/platform/manifest.git -b android-5.1.1
$ repo sync -j4 --current-branch --no-tags
$ . build/envsetup.sh
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

This recovery image is not required for the normal dev workflow.


### Configuring Nexus 6 (Shamu)

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

Expect to be stuck on the Twiddling Antenna Android "Erasing..." screen for
10-20 minutes upon your first flash.  You will need to manually reflash
`userdata.img` once the Erasing screen is complete (or easier, run `./flash.sh`
again)

### Linux FTW?

Building on Linux is 2x faster, even when running Linux in a VM hosted by OS X.  Travis CI builds your PR on Linux to boot.


### Video uploading

Video and metadata uploading are disabled by default.

To enable uploads:
```sh
adb shell setprop persist.silk.vidupload.enabled 1
adb shell setprop ctl.restart silk
```

To disable uploads:
```sh
adb shell rm /data/property/persist.silk.vidupload.enabled
adb reboot
```

### Configuring Video Duration

To change video duration:
```sh
# 5 second videos
adb shell setprop persist.silk.vidduration 5
adb reboot
```

### Maximum outbox concurrency


Set maximum outbox concurrency for items stored on disk.

```sh
# Maximum of 5 stored items uploaded in parallel.
adb shell setprop persist.silk.outconcurrency 5
adb shell stop silk
adb shell start silk
```



### Intelligent Detection

To enable audio ding when two or more claps are detected:

```sh
adb shell setprop persist.silk.clapper.sound true
adb shell setprop ctl.restart silk
```

To enable audio dings when motion is detected:
```sh
adb shell setprop persist.silk.motion.sound true
adb shell setprop ctl.restart silk
```

### OTA Updates

OTA updates are disabled by default.

To enable updates:
```
$ adb shell setprop persist.silk.update.enabled true
$ adb shell setprop persist.silk.update.channel master (set it to appropriate branch name)
$ adb reboot
```

To disable updates:
```
$ adb shell rm /data/property/persist.silk.update.enabled
$ adb reboot
```

### Automatic crash reporting

Crash reporting is disabled by default.

To enable reporting:
```
$ adb shell setprop persist.silk.crashrprt.enabled true
$ adb reboot
```

To disable reporting:
```
$ adb shell rm /data/property/persist.silk.crashrprt.enabled
$ adb reboot
```

### Logging

Logging uses the [debug](https://github.com/visionmedia/debug) module. To see all logging:
```
$ adb shell setprop persist.silk.debug silk-*
$ adb shell stop silk
$ adb shell start silk
```

To only log specific modules:
```
$ adb shell setprop persist.silk.debug silk-update:*,silk-crashreport:*
$ adb shell stop silk
$ adb shell start silk
```

Logging is split into three "levels": 'info', 'warn', and 'error'. To exclude 'info' messages you could do this:
```
$ adb shell setprop persist.silk.debug silk-update:*,-silk-update:info
$ adb shell stop silk
$ adb shell start silk
```

To see all logging, even from other node modules:
```
$ adb shell setprop 'persist.silk.debug "*"'
$ adb shell stop silk
$ adb shell start silk
```

Output is colored by default. To disable:
```
$ adb shell setprop persist.silk.debug.colors false
$ adb shell stop silk
$ adb shell start silk
```

To re-enable colored output:
```
$ adb shell setprop persist.silk.debug.colors true
$ adb shell stop silk
$ adb shell start silk
```

### Profiling

(See [./vendor/silk/core] for full details)

To enable:

```sh
adb shell setprop persist.silk.profiling.enabled true
adb shell stop silk
adb shell start silk
```

Disable

```sh
adb shell setprop persist.silk.profiling.enabled false
adb shell stop silk
adb shell start silk
```
