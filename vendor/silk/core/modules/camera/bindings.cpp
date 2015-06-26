/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: sw=2 ts=8 et :
 */

#define LOG_NDEBUG 0
#define LOG_TAG "gonkcamera"
#include <utils/Log.h>

#include <vector>

#include <binder/ProcessState.h>
#include <camera/Camera.h>
#include <camera/CameraParameters.h>
#include <gui/Surface.h>
#include <gui/SurfaceControl.h>
#include <gui/ConsumerBase.h>
#include <gui/CpuConsumer.h>
#include <gui/GraphicBufferAlloc.h>
#include <gui/SurfaceComposerClient.h>
#include <gui/ISurfaceComposer.h>
#include <ui/DisplayInfo.h>

#include <nan.h>

using namespace v8;
using namespace android;

struct UVMutex {
  UVMutex() {
    uv_mutex_init(&mutex);
  }
  ~UVMutex() {
    uv_mutex_destroy(&mutex);
  }
private:
  uv_mutex_t mutex;
  friend struct AutoLockUVMutex;
};
#define uv_mutex_t USE_UVMutex_PLEASE
#define uv_mutex_init USE_UVMutex_PLEASE
#define uv_mutex_destroy USE_UVMutex_PLEASE

struct AutoLockUVMutex {
  AutoLockUVMutex(UVMutex& mutex) : mutex(mutex) {
    uv_mutex_lock(&mutex.mutex);
  }
  ~AutoLockUVMutex() {
    uv_mutex_unlock(&mutex.mutex);
  }
private:
  UVMutex& mutex;
  AutoLockUVMutex(const AutoLockUVMutex&);
  AutoLockUVMutex& operator=(const AutoLockUVMutex&);
};
#define uv_mutex_lock USE_AutoLockUVMutex_PLEASE
#define uv_mutex_unlock USE_AutoLockUVMutex_PLEASE

NAN_METHOD(GetCameraInfo) {
  NanScope();

  int n = Camera::getNumberOfCameras();
  Local<Array> list = NanNew<Array>(n);

  for (int i = 0; i < n; i++) {
    struct CameraInfo info;
    status_t err = Camera::getCameraInfo(i, &info);
    if (!err) {
      Local<Object> o = NanNew<Object>();
      o->Set(NanNew<String>("facing"), NanNew<Integer>(info.facing));
      o->Set(NanNew<String>("orientation"), NanNew<Integer>(info.orientation));
      list->Set(i, o);
    }
  }

  NanReturnValue(list);
}

class GonkCamera : public node::ObjectWrap, public CameraListener
{
  typedef std::vector<char> ByteVector;

public:
  static void Init(v8::Handle<v8::Object> exports) {
    NanScope();
    v8::Local<v8::FunctionTemplate> tpl = NanNew<v8::FunctionTemplate>(New);
    tpl->SetClassName(NanNew("GonkCamera"));
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    NODE_SET_PROTOTYPE_METHOD(tpl, "disconnect", Disconnect);
    NODE_SET_PROTOTYPE_METHOD(tpl, "getParameters", GetParameters);
    NODE_SET_PROTOTYPE_METHOD(tpl, "onFaceDetect", OnFaceDetect);
    NODE_SET_PROTOTYPE_METHOD(tpl, "onPreviewFrame", OnPreviewFrame);
    NODE_SET_PROTOTYPE_METHOD(tpl, "startPreview", StartPreview);
    NODE_SET_PROTOTYPE_METHOD(tpl, "stopPreview", StopPreview);

    NanAssignPersistent(constructor, tpl->GetFunction());
    exports->Set(NanNew("Camera"), tpl->GetFunction());
  }

  //
  // CameraListener methods
  //
  void notify(int32_t msgType, int32_t ext1, int32_t ext2)
  {
    ALOGV("CameraListener::notify. msgtype=%d\n", msgType);
  }

  void postData(int32_t msgType, const sp<IMemory>& dataPtr,
                camera_frame_metadata_t *metadata)
  {
    if (CAMERA_MSG_PREVIEW_FRAME & msgType) {
      //ALOGD("CameraListener::postData frame callback: 0x%x (%d bytes)",
      //  (unsigned) dataPtr->pointer(), dataPtr->size());

      // TODO: can we do a more efficient copy than the one here?
      AutoLockUVMutex lock(frameDataLock);
      if (frameAsync != NULL) {
        frameData.assign((char*)dataPtr->pointer(),
                         (char*)dataPtr->pointer() + dataPtr->size());
        uv_async_send(frameAsync);
      }
    } else if (CAMERA_MSG_PREVIEW_METADATA & msgType) {
      AutoLockUVMutex lock(frameMetaDataLock);

      if (metadata != NULL && faceAsync != NULL) {
        delete frameMetaData.faces;
        frameMetaData.number_of_faces = metadata->number_of_faces;
        frameMetaData.faces = new camera_face_t[frameMetaData.number_of_faces];
        memcpy(frameMetaData.faces, metadata->faces,
          sizeof(camera_face_t) * frameMetaData.number_of_faces);
        uv_async_send(faceAsync);
      }
    } else {
      ALOGE("Unhandled CameraListener::postData. msgType=%d\n", msgType);
    }
  }

  void postDataTimestamp(nsecs_t timestamp, int32_t msgType, const sp<IMemory>& dataPtr)
  {
    ALOGV("CameraListener::postDataTimestamp. msgType=%d\n", msgType);
  }
  //
  // End of CameraListener methods
  //

private:
  explicit GonkCamera(int cameraId = 0)
    : mCamera(NULL), frameCallback(NULL), faceCallback(NULL)
    , frameAsync(NULL), faceAsync(NULL), frameMetaData(), mSurfaceControl(NULL)
  {
    if (cameraId < 0 || cameraId >= Camera::getNumberOfCameras()) {
      NanThrowError("GonkCamera: Invalid camera Id");
      return;
    }

    sp<ProcessState> ps = ProcessState::self();
    ps->startThreadPool();

    // Get main display parameters.
    sp<IBinder> mainDpy = SurfaceComposerClient::getBuiltInDisplay(
            ISurfaceComposer::eDisplayIdMain);
    status_t err = SurfaceComposerClient::getDisplayInfo(mainDpy, &mainDpyInfo);
    if (err) {
      ALOGE("getDisplayInfo failed: %d", err);
      mainDpyInfo.w = 640;
      mainDpyInfo.h = 480;
      mainDpyInfo.fps = 1;
      mainDpyInfo.orientation = 0;
    }
    ALOGW("Main display is %dx%d @%.2ffps (orientation=%u)\n",
          mainDpyInfo.w, mainDpyInfo.h, mainDpyInfo.fps,
          mainDpyInfo.orientation);

    mCamera = Camera::connect(cameraId, String16("nodecamera"), Camera::USE_CALLING_UID);
    if (mCamera == 0) {
      NanThrowError("Unable to connect to camera");
      return;
    }

    struct CameraInfo info;
    err = Camera::getCameraInfo(cameraId, &info);
    if (!err) {
      cameraOrientation = info.orientation;
      cameraFacing = info.facing;
    } else {
      cameraOrientation = 0;
      cameraId = 0;
    }

    mCamera->setListener(this);
    ClearState();
  }

  ~GonkCamera()
  {
    ClearState();
    mCamera = NULL;
    delete frameCallback;
    frameCallback = NULL;
    delete faceCallback;
    faceCallback = NULL;
  }

  static NAN_METHOD(New)
  {
    NanScope();

    if (args.IsConstructCall()) {
      int cameraId = args[0]->IsUndefined() ? 0 : args[0]->NumberValue();
      GonkCamera *obj = new GonkCamera(cameraId);
      obj->Wrap(args.This());
      NanReturnThis();
    } else {
      const int argc = 1;
      v8::Local<v8::Value> argv[argc] = {args[0]};
      v8::Local<v8::Function> cons = NanNew(constructor);
      NanReturnValue(cons->NewInstance(argc, argv));
    }
  }

  static NAN_METHOD(Disconnect)
  {
    NanScope();
    GonkCamera *me = ObjectWrap::Unwrap<GonkCamera>(args.Holder());

    // This method is a terrible hack to work around lack of concurrent camera support.
    me->ClearState();
    me->mCamera->disconnect();
    me->mSurfaceControl = NULL;
    NanReturnUndefined();
  }

  static NAN_METHOD(GetParameters)
  {
    NanScope();
    GonkCamera *me = ObjectWrap::Unwrap<GonkCamera>(args.Holder());
    String8 camParameters = me->mCamera->getParameters();
    NanReturnValue(NanNew<String>(camParameters.string()));
  }

  sp<IGraphicBufferProducer> CreatePreviewSurface()
  {
    sp<SurfaceComposerClient> scc = new SurfaceComposerClient();
    if (scc.get() == NULL) {
      ALOGE("Unable to establish connection to Surface Composer");
      return NULL;
    }
    sp<SurfaceControl> sc = scc->createSurface(String8("gonkcamera"),
      mainDpyInfo.w, mainDpyInfo.h, PIXEL_FORMAT_RGBX_8888, 0);

    if (sc.get() == NULL) {
      ALOGE("Unable to create preview surface");
      return NULL;
    }

    sp<Surface> previewSurface = sc->getSurface();
#if 0
    if (NULL != previewSurface.get()) {
        scc->openGlobalTransaction();
        int ret = 0;
        ret |= sc->setLayer(0x7fffffff);
        ret |= sc->setPosition(0, 0);
        ret |= sc->setSize(mainDpyInfo.w, mainDpyInfo.h);
        ret |= sc->show();
        scc->closeGlobalTransaction();

        if (ret) {
          ALOGE("Preview surface configuration failed");
          return NULL;
        }
    } else {
      ALOGE("No previewSurface");
      return NULL;
    }
#endif
    this->mSurfaceControl = sc;

    return previewSurface->getIGraphicBufferProducer();
  }

  static NAN_METHOD(OnFaceDetect)
  {
    NanScope();
    GonkCamera *me = ObjectWrap::Unwrap<GonkCamera>(args.Holder());
    status_t err;

    delete me->faceCallback;
    me->faceCallback = new NanCallback(args[0].As<Function>());

    NanReturnUndefined();
  }

  static NAN_METHOD(OnPreviewFrame)
  {
    NanScope();
    GonkCamera *me = ObjectWrap::Unwrap<GonkCamera>(args.Holder());
    status_t err;

    delete me->frameCallback;
    me->frameCallback = new NanCallback(args[0].As<Function>());

    NanReturnUndefined();
  }

  static NAN_METHOD(StartPreview)
  {
    NanScope();
    GonkCamera *me = ObjectWrap::Unwrap<GonkCamera>(args.Holder());
    status_t err;

    me->ClearState();

    err = me->mCamera->setPreviewTarget(me->CreatePreviewSurface());
    if (err) {
      NanThrowError("GonkCamera: Unable to setPreviewTarget");
      return;
    }

    // TODO: Select a preview size dynamically that is as close as possible to
    // the mainDpyInfo width/height, or ask node for it.
    CameraParameters camParameters(me->mCamera->getParameters());
    //camParameters.setPreviewSize(1280, 720);
    //camParameters.setPreviewSize(640, 480);
    camParameters.setPreviewSize(320, 240);
    err = me->mCamera->setParameters(camParameters.flatten());
    if (err) {
      NanThrowError("GonkCamera: Unable to setParameters");
      return;
    }

    // Set camera to its natural orientation
    // (stupid question: why can't this be the default)?.
    err = me->mCamera->sendCommand(CAMERA_CMD_SET_DISPLAY_ORIENTATION,
      (180 * me->cameraFacing + me->cameraOrientation ) % 360, 0);
    if (err) {
      NanThrowError("GonkCamera: set display orientation failed");
      return;
    }


    if (me->faceCallback != NULL) {
      me->faceAsync = new uv_async_t;
      uv_async_init(uv_default_loop(), me->faceAsync, FaceDetectCallback);
      me->faceAsync->data = me;
    }

    if (me->frameCallback != NULL) {
      me->frameAsync = new uv_async_t;
      uv_async_init(uv_default_loop(), me->frameAsync, FrameCallback);
      me->frameAsync->data = me;
      me->mCamera->setPreviewCallbackFlags(CAMERA_FRAME_CALLBACK_FLAG_CAMCORDER);
    } else {
      me->mCamera->setPreviewCallbackFlags(CAMERA_FRAME_CALLBACK_FLAG_NOOP);
    }

    err = me->mCamera->startPreview();
    if (err) {
      NanThrowError("GonkCamera: Unable to startPreview");
      return;
    }

    if (!me->mCamera->previewEnabled()) {
      NanThrowError("GonkCamera: preview failed to start");
      return;
    }

    if (me->faceCallback != NULL) {
      err = me->mCamera->sendCommand(CAMERA_CMD_START_FACE_DETECTION, CAMERA_FACE_DETECTION_SW, 0);
      if (err != 0) {
        ALOGE("GonkCamera: unable to start face detection: %d", err);
      }
    }

    NanReturnValue(NanTrue);
  }

  NAN_INLINE static NAUV_WORK_CB(FaceDetectCallback)
  {
    GonkCamera *me = static_cast<GonkCamera*>(async->data);
    NanScope();
    Local<Value> argv[1];

#if 0
    for (int i = 0; i < me->frameMetaData.number_of_faces; i++) {
      camera_face_t *face = &me->frameMetaData.faces[i];
      printf("Whoa, a face! id=%d confidence=%d%%\n", face->id, face->score);
      printf("\tbounds: (%d,%d)x(%d,%d)\n", face->rect[0], face->rect[1], face->rect[2], face->rect[3]);
      printf("\tleft eye: (%d,%d)\n", face->left_eye[0], face->left_eye[1]);
      printf("\tright eye: (%d,%d)\n", face->right_eye[0], face->right_eye[1]);
      printf("\tmouth: (%d,%d)\n", face->mouth[0], face->mouth[1]);
    }
#endif

    {
      AutoLockUVMutex(me->frameMetaDataLock);

      if (me->faceCallback != NULL) {
        if (me->frameMetaData.number_of_faces > 0) {
          Local<Array> faces = NanNew<Array>(me->frameMetaData.number_of_faces);
          for (int i = 0; i < me->frameMetaData.number_of_faces; i++) {
            Local<Array> list = NanNew<Array>(5);
            camera_face_t *face = &me->frameMetaData.faces[i];
            list->Set(0, NanNew<Number>(face->id));
            list->Set(1, NanNew<Number>(face->rect[0]));
            list->Set(2, NanNew<Number>(face->rect[1]));
            list->Set(3, NanNew<Number>(face->rect[2]));
            list->Set(4, NanNew<Number>(face->rect[3]));

            faces->Set(i, list);
          }
          argv[0] = faces;
        } else {
          argv[0] = NanNew<Array>(0);
        }
      }

      delete me->frameMetaData.faces;
      me->frameMetaData.faces = NULL;
      me->frameMetaData.number_of_faces = 0;
    }

    if (me->faceCallback != NULL) {
      me->faceCallback->Call(sizeof(argv) / sizeof(argv[0]), argv);
    }
  }

  NAN_INLINE static NAUV_WORK_CB(FrameCallback)
  {
    GonkCamera *me = static_cast<GonkCamera*>(async->data);
    NanScope();
    Local<Value> argv[1];

    AutoLockUVMutex(me->frameDataLock);
    if (me->frameCallback != NULL) {
      argv[0] = NanNewBufferHandle(&me->frameData[0], me->frameData.size());
      me->frameCallback->Call(sizeof(argv) / sizeof(argv[0]), argv);
    }
  }

  static NAN_METHOD(StopPreview)
  {
    NanScope();
    GonkCamera *me = ObjectWrap::Unwrap<GonkCamera>(args.Holder());

    me->mCamera->stopPreview();

    me->ClearState();
    NanReturnUndefined();
  }


  static v8::Persistent<v8::Function> constructor;

  static void DeleteUvHandle(uv_handle_t *handle)
  {
    delete handle;
  }

  void ClearState()
  {
    AutoLockUVMutex lock(frameMetaDataLock);
    AutoLockUVMutex lock2(frameDataLock);

    if (frameAsync != NULL) {
      uv_close((uv_handle_t *) frameAsync, DeleteUvHandle);
      frameAsync = NULL;
    }
    if (faceAsync != NULL) {
      uv_close((uv_handle_t *) faceAsync, DeleteUvHandle);
      faceAsync = NULL;
    }

    mSurfaceControl = NULL;

    delete frameMetaData.faces;
    frameMetaData.faces = NULL;
  }

  DisplayInfo mainDpyInfo;
  sp<Camera> mCamera;
  int cameraOrientation;
  int cameraFacing;
  NanCallback *frameCallback;
  NanCallback *faceCallback;
  uv_async_t *frameAsync;
  uv_async_t *faceAsync;

  camera_frame_metadata_t frameMetaData;
  UVMutex frameMetaDataLock;

  ByteVector frameData;
  UVMutex frameDataLock;

  sp<SurfaceControl> mSurfaceControl;
};
v8::Persistent<v8::Function> GonkCamera::constructor;

void init(Handle<Object> exports) {
  exports->Set(NanNew<String>("getCameraInfo"),
    NanNew<FunctionTemplate>(GetCameraInfo)->GetFunction());
  GonkCamera::Init(exports);
}
NODE_MODULE(camera, init)
