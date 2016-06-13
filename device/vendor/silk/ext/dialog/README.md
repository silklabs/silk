Explanation of various android properties to alter the behavior of dialog extension

* `persist.silk.kws.enabled` (default: false) - Use keyword spotting to trigger the dialog.
If false, the volume down keys are required instead. Pressing the volume down key once starts the speech processing and pressing it again
stops the speech processing.
* `persist.silk.dialog.tts.enabled` (default: true) - If true local tts is used on the device for text to speech conversion
instead of the cloud based TTS.
* `persist.silk.kws.vad.enabled` (default: false) - If true, keyword is only spotted during a voice activity.
* `persist.silk.kws.save` (default: false) - It true, every utterance of keyword is saved as a wav file at `data/media/`
