import createVoiceDialogLooper from './voiceDialogLooper';
import babyScriptData from '../baby/babyScriptData';
import createBabyInitState from '../baby/babyState';

let vdl = createVoiceDialogLooper(babyScriptData, createBabyInitState);
vdl.start();
