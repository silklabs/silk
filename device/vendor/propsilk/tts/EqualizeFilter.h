/*
* Copyright (c) 2015-2016 Silk Labs, Inc.
* All Rights Reserved.
* Confidential and Proprietary - Silk Labs, Inc.
*
* Not a Contribution.
* Apache license notifications and license are retained
* for attribution purposes only.
*
* Copyright (C) 2011 The Android Open Source Project
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not
* use this file except in compliance with the License. You may obtain a copy of
* the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
* WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
* License for the specific language governing permissions and limitations under
* the License.
*/

/**
 * This is a verbatim copy of the code at
 * external/svox/pico/compat/src/com/android/tts/compat/SynthProxy.java
 */

#define DEFAULT_TTS_RATE        16000

// Default parameters of a filter to be applied when using the Pico engine.
// Such a huge filter gain is justified by how much energy in the low frequencies
// is "wasted" at the output of the synthesis. The low shelving filter removes it,
// leaving room for amplification
static float PICO_FILTER_GAIN = 5.0f;  // linear gain
static float PICO_FILTER_LOWSHELF_ATTENUATION = -18.0f;  // in dB
static float PICO_FILTER_TRANSITION_FREQ = 1100.0f;  // in Hz
static float PICO_FILTER_SHELF_SLOPE = 1.0f;  // Q

// EQ data
static double m_fa, m_fb, m_fc, m_fd, m_fe;
static double x0;  // x[n]
static double x1;  // x[n-1]
static double x2;  // x[n-2]
static double out0;  // y[n]
static double out1;  // y[n-1]
static double out2;  // y[n-2]

static float fFilterLowshelfAttenuation = PICO_FILTER_LOWSHELF_ATTENUATION;
static float fFilterTransitionFreq = PICO_FILTER_TRANSITION_FREQ;
static float fFilterShelfSlope = PICO_FILTER_SHELF_SLOPE;
static float fFilterGain = PICO_FILTER_GAIN;

/**
 *
 */
void initializeEQ() {
  double amp = float(pow(10.0, fFilterLowshelfAttenuation / 40.0));
  double w = 2.0 * M_PI * (fFilterTransitionFreq / DEFAULT_TTS_RATE);
  double sinw = float(sin(w));
  double cosw = float(cos(w));
  double beta = float(sqrt(amp) / fFilterShelfSlope);

  // initialize low-shelf parameters
  double b0 = amp * ((amp + 1.0F) - ((amp - 1.0F) * cosw) + (beta * sinw));
  double b1 = 2.0F * amp * ((amp - 1.0F) - ((amp + 1.0F) * cosw));
  double b2 = amp * ((amp + 1.0F) - ((amp - 1.0F) * cosw) - (beta * sinw));
  double a0 = (amp + 1.0F) + ((amp - 1.0F) * cosw) + (beta * sinw);
  double a1 = 2.0F * ((amp - 1.0F) + ((amp + 1.0F) * cosw));
  double a2 = -((amp + 1.0F) + ((amp - 1.0F) * cosw) - (beta * sinw));

  m_fa = fFilterGain * b0 / a0;
  m_fb = fFilterGain * b1 / a0;
  m_fc = fFilterGain * b2 / a0;
  m_fd = a1 / a0;
  m_fe = a2 / a0;
}

/**
 *
 */
void initializeFilter() {
  x0 = 0.0f;
  x1 = 0.0f;
  x2 = 0.0f;
  out0 = 0.0f;
  out1 = 0.0f;
  out2 = 0.0f;
}

/**
 * Apply filter if the TTS engine is pico. This seems to result in better
 * voice quality.
 */
void applyFilter(int16_t* buffer, size_t sampleCount) {
  for (size_t i = 0; i < sampleCount; i++) {
    x0 = (double) buffer[i];
    out0 = (m_fa * x0) + (m_fb * x1) + (m_fc * x2) + (m_fd * out1)
        + (m_fe * out2);

    x2 = x1;
    x1 = x0;
    out2 = out1;
    out1 = out0;

    if (out0 > 32767.0f) {
      buffer[i] = 32767;
    } else if (out0 < -32768.0f) {
      buffer[i] = -32768;
    } else {
      buffer[i] = (int16_t) out0;
    }
  }
}

/**
 * Apply audio filter only if the engine is pico
 */
bool shouldApplyAudioFilter(const char* nativeSoLib) {
    return (strstr(nativeSoLib, "pico") != NULL);
}
