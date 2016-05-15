export default function (browserifyStream) {
  browserifyStream.external('silk-caffe');
  browserifyStream.external('silk-core-version');
  browserifyStream.external('silk-cv');
  browserifyStream.external('silk-gc1');
  browserifyStream.external('silk-movie');
  browserifyStream.external('bleno');
  browserifyStream.external('noble');
  browserifyStream.external('opencv');
  browserifyStream.external('node-webrtc');
}
