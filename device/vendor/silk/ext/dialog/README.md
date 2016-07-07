Explanation of various android properties to alter the behavior of dialog extension

* `persist.silk.kws.enabled` (default: true) - Use keyword spotting to trigger
a dialog
* `persist.silk.dialog.tts.enabled` (default: false) - If true local tts is used
on the device for text to speech conversion instead of the cloud based TTS.
* `persist.silk.kws.vad.enabled` (default: false) - If true, keyword is only
spotted during a voice activity.
* `persist.silk.kws.save` (default: true) - It true, every utterance of keyword
is saved as a wav file at `data/media/kws` on the device.
* `persist.silk.kws.threshold` - (default: 65) Set the threshold for keyword
spotting.
* `persist.silk.speech.save` - (default: false) If set save the raw pcm data
sent to `silk-stt` as wav files at `data/media/` on the device.
