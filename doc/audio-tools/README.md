## Audio tools

Web app and device (and therefore `sim`) have tools for working with audio.  This document describes basic usage.

### Prepare your environment

You'll want to use a local server and device or `sim`.  The tools probably work when used with the public server, but

0. that's not been tested
1. the mic stream from device/`sim` to webapp isn't compressed, so performance likely sucks
2. anyone in the world can listen to your audio stream!!

Given a local server and configured device / `sim`, all you need to do is flip a couple prefs
```bash
adb shell setprop persist.silk.extensions '*,-oksilk,-cmt,-detectcat,-dnn'
adb shell setprop persist.silk.vidupload.type none
adb shell stop
sleep 2
adb shell start
```
(resp. `./sim/system/bin/setprop` for `sim`).

### View live mic stream

The most basic usage to view the live stream.  To do so, load webapp and look for your device / `sim` in the device list.  Click the headphones icon to open the audio tools.  If your environment was prepared correctly, you should see some a moving blue background in the view box.  When you make loud sounds around the device / `sim`, you should see new "stuff" appear on the blue view and then scroll out of view.  The live view has a few options:

* **Graph View**: choose the data being displayed.  Default is the "spectrogram", which is a sequence of frequency-domain samples over time.  The samples can be shown in either linear scale, or decibel (~logarithmic) view.  In decibel scale, loud sounds are easier to see, at the cost of more noise.  You can also view the live frequency domain data coming in, a la the WinAmp-style display, also in either linear or decimal scale.  You can also view the live waveform.
* **Color Model**: the spectrogam intensities actually range from `[0, 1]` --- on the view they're artificially colorized for easier viewing by humans.  You can choose between different artifical colorization schemes, or grayscale for "none".
* **Draw Grid**: when enabled, on the spectrogram view a grid mark is drawn on the y-axis every 500Hz, and on the x-axis for every frequency-domain sample.

Your preferences are saved locally.

### Play incoming mic stream

By default, the mic stream is muted and only analysis results are displayed.  By pressing the "speaker" button in the bottom-left of the studio view, you can toggle mute for the mic stream.

### Record incoming mic stream

There are two tools for recording the mic stream.  The first is a basic start/stop manual record.  Press the "record" button (concentric circles, not a great icon) to start recording, and then press the "stop" button that appears to stop recording.  The audio that you recorded is shown in the analysis display.  There's a scrubber below the analysis view to let you view different parts of the recording.

Your recordings are saved to a local "file system" within the web app.  You can play back old recordings by pressing the "folder" icon in the bottom-left of the studio view and tapping the saved recording you want to play.  You can also delete old recordings in this view.

The second tool is an "auto-recorder".  Press the refresh-button looking icon to start (another bad icon).  In this mode, whenever a loud sound is detected, it's automatically saved.  Stop auto-recording by pressin the "stop" button.

### Import / export recordings

You can export any recording by pressing the "download" icon on the recording in the file-system view.  You can also download all recordings as a TAR by pressing the download button on the virtual "(All)" recording to the left.

To import a WAV file, just drag and drop it anywhere in the studio view.  The studio view darkens with a lightbox when your recording is over the drop target.  You can also drag and drop TAR archives containing WAV files (or other TAR archives, which are recursively imported) and all files within are added individually to the file system view.

The importing code is extremely dumb and will happily overwrite existing recordings of the same name as a new one you're importing.  Caveat emptor!

### Benchmarking the audio analysis du jour

You can import a special file called `benchmark.tar` that contains subdirectories labeled with sound events.  In each subdirectory reside WAV files and TAR archives.  When this special archive is imported, the current analysis du jour (as of this writing, clapper evaluation and SVM training) will kick off and the contained files *will not* be added to the local file system.
