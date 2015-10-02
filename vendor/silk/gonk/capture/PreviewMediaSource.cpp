/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "PreviewMediaSource"

#include "PreviewMediaSource.h"
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/foundation/ADebug.h>
#include "Capturedefs.h"
#include <media/openmax/OMX_IVCommon.h>

extern "C" {
#include "jpeglib.h"
}

using namespace android;

PreviewMediaSource::PreviewMediaSource(Channel *channel,
    const sp<MediaSource> &source, int skipCount) :
    mChannel(channel),
    mSource(source),
    mSkipCount(skipCount),
    mCounter(0) {
}

PreviewMediaSource::~PreviewMediaSource() {
}

status_t PreviewMediaSource::start(MetaData *params) {
  return mSource->start(params);
}

status_t PreviewMediaSource::stop() {
  return mSource->stop();
}

sp<MetaData> PreviewMediaSource::getFormat() {
  return mSource->getFormat();
}

status_t PreviewMediaSource::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);
  if (err != ::OK)
    return err;

  // Some platforms put the cbcr plane data some number of padding byes after
  // the y-plane. Not sure why. Let's workaround by copying the cbcr data to
  // where the rest of the world expects it to be.
  if (sYuvPlanePadBytes) {
    uint8_t *frame = reinterpret_cast<uint8_t*>((*buffer)->data())
        + (*buffer)->range_offset();
    uint8_t *cbcr = frame + (sSliceHeight * sStride);
    memmove(cbcr, cbcr + sYuvPlanePadBytes, sSliceHeight * sStride / 2);
  }

  if (mCounter++ >= mSkipCount) {
    snapshot(*buffer);
    mCounter = 0;
  }
  return ::OK;
}

struct jpeg_state {
  jpeg_compress_struct cinfo;
  Vector<JOCTET> buffer;
};

static void jpeg_init_destination(j_compress_ptr cinfo) {
  jpeg_state *state = reinterpret_cast<jpeg_state *>(cinfo);
  state->buffer.resize(1024 * 1024);
  cinfo->dest->next_output_byte = state->buffer.begin();
  cinfo->dest->free_in_buffer = state->buffer.size();
}

static boolean jpeg_empty_output_buffer(j_compress_ptr cinfo) {
  jpeg_state *state = reinterpret_cast<jpeg_state *>(cinfo);
  size_t oldsize = state->buffer.size();
  state->buffer.resize(oldsize * 2);
  cinfo->dest->next_output_byte = state->buffer.begin() + oldsize;
  cinfo->dest->free_in_buffer = oldsize;
  return true;
}

static void jpeg_term_destination(j_compress_ptr cinfo) {
  jpeg_state *state = reinterpret_cast<jpeg_state *>(cinfo);
  state->buffer.resize(state->buffer.size() - cinfo->dest->free_in_buffer);
}

void PreviewMediaSource::snapshot(MediaBuffer* img) {
  sp<MetaData> meta = mSource->getFormat();

  int32_t imageWidth = sVideoSize.width / sPreviewScale;
  int32_t imageHeight = sVideoSize.height / sPreviewScale;

  jpeg_state state;
  struct jpeg_compress_struct *cinfo = &state.cinfo;
  struct jpeg_error_mgr jerr;
  cinfo->err = jpeg_std_error(&jerr);
  jpeg_create_compress(cinfo);

  jpeg_destination_mgr mgr;
  mgr.init_destination = &jpeg_init_destination;
  mgr.empty_output_buffer = &jpeg_empty_output_buffer;
  mgr.term_destination = &jpeg_term_destination;
  cinfo->dest = &mgr;

  cinfo->image_width = imageWidth;
  cinfo->image_height = imageHeight;
  cinfo->input_components = 3;
  cinfo->in_color_space = JCS_YCbCr;

  jpeg_set_defaults(cinfo);
  jpeg_set_quality(cinfo, 80, TRUE);

  jpeg_start_compress(cinfo, TRUE);

  const uint8_t *frame = reinterpret_cast<uint8_t*>(img->data())
      + img->range_offset();
  const uint8_t *y_plane = frame;
  const uint8_t *cbcr_plane = frame + sSliceHeight * sStride;

  uint8_t buffer[3 * (imageWidth + 1)];
  for (int row = 0; row < imageHeight; row++) {
    int32_t ycbcr_row = row * sPreviewScale;
    const uint8_t *y_row = y_plane + ycbcr_row * sStride;
    const uint8_t *cbcr_row = cbcr_plane + (ycbcr_row / 2) * sStride;
    for (int x = 0; x < imageWidth; x++) {
      int32_t ycbcr_x = x * sPreviewScale;
      buffer[x * 3 + 0] = y_row[ycbcr_x];
      buffer[x * 3 + 1] = cbcr_row[(ycbcr_x & (~1))];
      buffer[x * 3 + 2] = cbcr_row[(ycbcr_x & (~1)) + 1];
    }
    JSAMPROW rowptr = reinterpret_cast<JSAMPROW>(buffer);
    jpeg_write_scanlines(cinfo, &rowptr, 1);
  }

  jpeg_finish_compress(cinfo);
  jpeg_destroy_compress(cinfo);

  mChannel->send(Channel::TAG_PREVIEW, state.buffer.begin(), state.buffer.size());
}
