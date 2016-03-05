## js-kissfft

This is an import of the KissFFT library compiled by emscripten.  The emscripten build is not done as part of this build process, but rather was import from this repository:

https://code.soundsoftware.ac.uk/projects/js-dsp-test/repository/revisions/a47f895d79c08cd430df29db6ef4c19c18f80efb

The content in this module was created by running the following commands
```
wget https://code.soundsoftware.ac.uk/projects/js-dsp-test/repository/revisions/a47f895d79c08cd430df29db6ef4c19c18f80efb/raw/fft/kissfft/KissFFT.js
wget https://code.soundsoftware.ac.uk/projects/js-dsp-test/repository/revisions/a47f895d79c08cd430df29db6ef4c19c18f80efb/raw/fft/kissfft/FFT.js
cat FFT.js >> KissFFT.js
rm FFT.js
echo "\n\nmodule.exports = { KissFFT: KissFFT, KissFFTR: KissFFTR, };" >> KissFFT.js
```

An example of using the FFT.js wrapper is shown [here](https://code.soundsoftware.ac.uk/projects/js-dsp-test/repository/revisions/a47f895d79c08cd430df29db6ef4c19c18f80efb/entry/fft/test.js#L253).
