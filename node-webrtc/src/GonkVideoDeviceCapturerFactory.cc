/**
 * GonkVideoDeviceCapturerFactory plays dirty tricks to avoid unnecessary buffer
 * copies from the video capture input to video encoder output
 */
#include "webrtc/media/engine/webrtcvideocapturer.h"
#include "webrtc/media/engine/webrtcvideoframefactory.h"
#include "webrtc/modules/video_capture/gonk/libpreview_buffer.h"
#include "GonkVideoDeviceCapturerFactory.h"

using cricket::CapturedFrame;
using cricket::Device;
using cricket::VideoCapturer;
using cricket::WebRtcVideoCapturer;
using webrtc::gonk::LibPreviewBuffer;

class GonkVideoFrameFactory : public cricket::WebRtcVideoFrameFactory {
 public:
  explicit GonkVideoFrameFactory() {
    captured_frame.fourcc = cricket::FOURCC_I420;
    captured_frame.pixel_width = 1;
    captured_frame.pixel_height = 1;
  }

  cricket::VideoFrame* CreateAliasedFrame(const CapturedFrame* aliased_frame,
                                          int width,
                                          int height) const override {
    LOG(LS_ERROR) << "Error: CreateAliasedFrame should not be called";
    RTC_CHECK(false);
    return nullptr;
  }

  cricket::VideoFrame* CreateAliasedFrame(const CapturedFrame* input_frame,
                                          int cropped_input_width,
                                          int cropped_input_height,
                                          int output_width,
                                          int output_height) const override;

  void SetWebRtcVideoFrame(const webrtc::VideoFrame* frame) {
    if (!frame) {
      buffer = nullptr;
      captured_frame.width = 0;
      captured_frame.height = 0;
    } else {
      buffer = frame->video_frame_buffer();
      captured_frame.width = buffer->width();
      captured_frame.height = buffer->height();
      captured_frame.rotation = frame->rotation();
      captured_frame.time_stamp = frame->render_time_ms() * rtc::kNumNanosecsPerMillisec;
    }
  }

  const cricket::CapturedFrame* GetCapturedFrame() const {
    return &captured_frame;
  }

 private:
  rtc::scoped_refptr<webrtc::VideoFrameBuffer> buffer;
  cricket::CapturedFrame captured_frame;
};

cricket::VideoFrame* GonkVideoFrameFactory::CreateAliasedFrame(
    const CapturedFrame* input_frame,
    int cropped_input_width,
    int cropped_input_height,
    int output_width,
    int output_height) const {

  if (input_frame != &captured_frame) {
    LOG(LS_ERROR) << "Error: CreateAliasedFrame with unknown input_frame";
    RTC_CHECK(false);
  }

  if (cropped_input_height == output_width &&
      cropped_input_height == output_height) {
    std::unique_ptr<cricket::WebRtcVideoFrame> frame(
      new cricket::WebRtcVideoFrame(
        buffer,
        input_frame->time_stamp,
        input_frame->rotation)
    );
    return frame.release();
  }

  // Avoid a buffer copy while downscaling by using LibPreviewBuffer->transfer()
  // to forge a new VideoFrameBuffer with the output dimensions
  LibPreviewBuffer *lpb = (LibPreviewBuffer *) buffer.get();
  std::unique_ptr<cricket::WebRtcVideoFrame> frame(
    new cricket::WebRtcVideoFrame(
      lpb->transfer(output_width, output_height),
      input_frame->time_stamp,
      input_frame->rotation
    )
  );
  return frame.release();
}

class GonkVideoCapturer: public WebRtcVideoCapturer {
 public:
  GonkVideoCapturer() {
    gonk_videoframe_factory = new GonkVideoFrameFactory();
    set_frame_factory(gonk_videoframe_factory);
  }

 protected:
  virtual void SignalFrameCapturedOnStartThread(const webrtc::VideoFrame& frame) override;

 private:
  GonkVideoFrameFactory *gonk_videoframe_factory; // Owned by WebRtcVideoCapturer
};

void GonkVideoCapturer::SignalFrameCapturedOnStartThread(const webrtc::VideoFrame& frame) {
  // HACK: Avoid a buffer copy by remembering the current frame so it can be
  //       recovered later from CreateAliasedFrame()
  gonk_videoframe_factory->SetWebRtcVideoFrame(&frame);
  SignalFrameCaptured(this, gonk_videoframe_factory->GetCapturedFrame());
  gonk_videoframe_factory->SetWebRtcVideoFrame(nullptr);
}

VideoCapturer* GonkVideoDeviceCapturerFactory::Create(const Device& device) {
  std::unique_ptr<GonkVideoCapturer> capturer(new GonkVideoCapturer());
  if (!capturer->Init(device)) {
    return nullptr;
  }
  return capturer.release();
}
