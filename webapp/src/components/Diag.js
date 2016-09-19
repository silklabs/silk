
import ansiUp from 'ansi_up';
import moment from 'moment';
import React from 'react';
import ReactDOM from 'react-dom';
import {
  Button,
  ButtonGroup,
  ButtonToolbar,
  DropdownButton,
  Glyphicon,
  Input,
  Label,
  MenuItem,
  Modal,
  Table,
} from 'react-bootstrap';
import { Link } from 'react-router';
import createLog from 'silk-log';

// XXX: Nasty hack to load localforage it does not load as a normal
// es6 module sadly with webpack...
require('script!localforage');
const localforage = window.localforage;

import Cameras from '../libraries/Cameras';
import CameraPreview from './CameraPreview';

const log = createLog('diag');

/**
 * Manages an <img> tag with jpeg data URL
 */
class JpegImgTag {
  tag: any; // The <img> DOM element
  constructor(jpeg: Buffer, onload: (() => void)) {
    const view = new Uint8Array(jpeg);
    const blob = new Blob([view], { type: 'image/jpg' });

    this.tag = document.createElement('img');
    this.tag.onload = onload;
    this.tag.src = URL.createObjectURL(blob);
  }

  deinit() {
    URL.revokeObjectURL(this.tag.src);
  }
}

// TODO: dedup with device/../timeline.js
type DiagJpegFrame = {
  id: string;
  when: number;
  jpeg: Buffer; // jpeg image data
};

type DiagImgFrame = {
  id: string;
  when: number;
  img: JpegImgTag;
};

class DiagImageTable extends React.Component {
  static propTypes = {
    camera: React.PropTypes.object.isRequired,
    paused: React.PropTypes.bool,
  };

  MAX_IMAGE_ROWS = 30 * 4; // = 30 seconds * 4 preview frames/second

  state = {
    images: {},
    imageKeys: [],
    imageFilter: '',
  };

  constructor() {
    super();
    localforage.getItem('diag-image-filter').then((imageFilter) => {
      // TODO: This is a little racy but probably ok.  If this promise doesn't
      // resolve before the component is first rendered (unlikely) then the
      // incorrect view will be shown.
      if (imageFilter) {
        this.setState({ imageFilter });
        this.onDiagFrameFilterApply();
      }
    });
  }

  shouldComponentUpdate() {
    return !this.props.paused;
  }

  componentWillMount() {
    this.props.camera.on('diagJpegFrames', this.onDiagJpegFrames);
    this.props.camera.on('diagState:timeline', this.onDiagTimelineState);
  }

  componentWillUnmount() {
    this.props.camera.removeListener('diagJpegFrames',
      this.onDiagJpegFrames);
    this.props.camera.removeListener('diagState:timeline',
      this.onDiagTimelineState);

    const { images, imageKeys } = this.state;
    imageKeys.forEach(key => {
      images[key].forEach(info => info.img.deinit());
    });
  }

  onDiagTimelineState = (state) => {
    log.debug('diagState:timeline', JSON.stringify(state));
    if (state.imageFilter === '' && this.state.imageFilter !== '') {
      // If the device imageFilter is empty and ours is not, override with ours.
      // This is useful during debugging sessions when the device continually
      // restarts and loses its state, as it avoids continually having to
      // reenter the imageFilter
      this.onDiagFrameFilterApply();
    } else {
      this.setState({imageFilter: state.imageFilter});
    }
  };


  addNewJpegs(loadedJpegs: Array<DiagImgFrame>) {
    let images = this.state.images;

    loadedJpegs.forEach(info => {
      const {id, when, img} = info;
      if (images[when]) {
        // Replace the image with the same |id| if it exists (this can happen
        // often if a clip is set for repeating)
        let index = images[when].findIndex(elem => elem.id === id);
        if (index > -1) {
          images[when][index] = {id, img};
        } else {
          images[when].push({id, img});
        }
      } else {
        images[when] = [{id, img}];
      }
    });

    const imageKeys = Object.keys(images).sort((a, b) => b - a);

    // Prune older images
    while (imageKeys.length > this.MAX_IMAGE_ROWS) {
      let oldestWhen = imageKeys[imageKeys.length - 1];
      images[oldestWhen].forEach((info) => info.img.deinit());
      delete images[oldestWhen];
      imageKeys.pop();
    }

    this.setState({images, imageKeys});
  }

  onDiagJpegFrames = (newFrames: Array<DiagJpegFrame>) => {
    const loadingJpegs = [];
    let loaded = 0;

    // Load each image via JpegImgTag
    newFrames.forEach(info => {
      const {id, when, jpeg} = info;

      let img = new JpegImgTag(jpeg, () => {
        loaded++;
        if (loaded === loadingJpegs.length) {
          // Now that all the images are loaded, add them to the component state
          // for rendering.
          this.addNewJpegs(loadingJpegs);
        }
      });
      loadingJpegs.push({id, when, img});
    });
  };

  onDiagFrameFilterChange = (e) => {
    this.setState({ imageFilter: e.target.value });
  };

  onClear = () => {
    this.setState({ images: {}, imageKeys: [] });
  };

  onDiagFrameFilterApply = () => {
    this.props.camera.diagTimelineCommand('imageFilter', this.state.imageFilter);
    localforage.setItem('diag-image-filter', this.state.imageFilter);
  };

  render() {
    let { images, imageKeys } = this.state;
    const filterApplyButton = (
      <Button onClick={this.onDiagFrameFilterApply}>Apply</Button>
    );
    return (
      <div>
        <div style={{flex: 1, display: 'flex', flexDirection: 'row'}}>
          <Button onClick={this.onClear}>Clear</Button>
          <Input
            type="text"
            bsSize="small"
            value={this.state.imageFilter}
            placeholder="Image filter. Example: '*', 'knockknock:*,cmt:*,-cmt:cat*'"
            onChange={this.onDiagFrameFilterChange}
            buttonBefore={filterApplyButton}
          />
        </div>
        <Table striped bordered condensed hover>
          <tbody>
          {
            imageKeys.map((key, index) => {
              const time = moment(parseInt(key, 10)).format('hh:mm:ss.SSS');
              return (
                <tr key={key + index}>
                  <td style={{verticalAlign: 'middle'}}>{time}</td>
                  {
                    images[key].map((info, index) => {
                      let {id, img} = info;
                      return (
                        <td key={id + index}>
                          {id}<br/>
                          <img
                            src={img.tag.src}
                            width={img.tag.width}
                            height={img.tag.height}
                          />
                        </td>
                      );
                    })
                  }
                </tr>
              );
            })
          }
          </tbody>
        </Table>
      </div>
    );
  }
}


class DiagCameraToolbar extends React.Component {
  static propTypes = {
    camera: React.PropTypes.object.isRequired,
  };

  state = {
    device: { // see CameraClipRecorderState in device/vendor/silk/core/lib/camera_clip_recorder.js
      mode: 'live',
      availableClips: [],
      msg: '',
      repeat: true,
    },
    showSaveDialog: false,
  };

  componentWillMount() {
    this.props.camera.on('diagState:camera',
      this.onDiagCameraState);
    this.sendCommand('hi');
  }

  componentWillUnmount() {
    this.props.camera.removeListener('diagState:camera',
      this.onDiagCameraState);
  }

  onDiagCameraState = (device /*: CameraClipRecorderState*/) => {
    log.error('diagState:camera', JSON.stringify(device));
    this.setState({device});
  };

  sendCommand(name, arg) {
    this.props.camera.diagCameraCommand(name, arg);
  }

  onRecordingStart = () => {
    this.sendCommand('record', 'start');
  };

  onRecordingStop = () => {
    this.sendCommand('record', 'stop');
  };

  onResumeLive = () => {
    this.sendCommand('live');
  };

  onPlayOrStop = () => {
    this.sendCommand('playback', this.state.device.mode === 'pause' ? 'start' : 'stop');
  };

  onGotoStart = () => {
    this.sendCommand('goto start');
  };

  onRewind = () => {
    this.sendCommand('rewind');
  };

  onFastForward = () => {
    this.sendCommand('fastforward');
  };

  onGotoEnd = () => {
    this.sendCommand('goto end');
  };

  onToggleRepeat = () => {
    this.sendCommand('repeat', !this.state.device.repeat);
  };

  onSelectTrim = (object, key) => {
    switch (key) {
    case 'before':
    case 'after':
      this.sendCommand('trim', key);
      break;
    default:
      log.error(`Unknown trim type: ${key}`);
      break;
    }
  };

  onSelectLoadClip = (object, key) => {
    this.sendCommand('load', key);
  };

  clipNameValid = () => {
    if (!this.refs.saveClipName) {
      return false;
    }
    const name = this.refs.saveClipName.getValue();
    if (name.length <= 0) {
      return false;
    }
    const validClipRegex = /^[A-Z0-9-@#()$^'"]*$/i;
    return validClipRegex.test(name);
  };

  onSaveClip = () => {
    if (this.clipNameValid()) {
      const name = this.refs.saveClipName.getValue();
      this.setState({showSaveDialog: false});
      this.sendCommand('save', name);
    }
  };

  onShowSaveDialog = () => {
    this.setState({showSaveDialog: true});
  };

  onHideSaveDialog = () => {
    this.setState({showSaveDialog: false});
  };

  render() {
    const scissorsGlpyhicon = <Glyphicon glyph="scissors"/>;
    const floppyOpenGlpyhicon = <Glyphicon glyph="floppy-save"/>;
    let loadClipDropdown;
    if (this.state.device.availableClips.length > 0) {
      loadClipDropdown = (
        <DropdownButton
          title={floppyOpenGlpyhicon}
          onSelect={this.onSelectLoadClip}>
          {this.state.device.availableClips.map(name => <MenuItem eventKey={name}>{name}</MenuItem>)}
        </DropdownButton>
      );
    }

    if (this.state.device.mode === 'live') {
      return (
        <ButtonToolbar>
          <ButtonGroup>
            <Button onClick={this.onRecordingStart}>
              <Glyphicon glyph="record"/>
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            {loadClipDropdown}
          </ButtonGroup>
          <Label>{this.state.device.msg}</Label>
        </ButtonToolbar>
      );
    }

    if (this.state.device.mode === 'record') {
      return (
        <ButtonToolbar>
          <ButtonGroup>
            <Button active onClick={this.onRecordingStop}>
              <Glyphicon glyph="record"/>
            </Button>
          </ButtonGroup>
          <Label>{this.state.device.msg}</Label>
        </ButtonToolbar>
      );
    }

    let activeDialog;
    if (this.state.showSaveDialog) {
      activeDialog = (
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Title>Save Clip</Modal.Title>
          </Modal.Header>

          <Modal.Body>
            <Input
              bsStyle={this.clipNameValid() ? 'success' : 'warning'}
              hasFeedback
              ref="saveClipName"
              type="text"
              placeholder="clip name"
            />
          </Modal.Body>

          <Modal.Footer>
            <Button onClick={this.onHideSaveDialog}>Close</Button>
            <Button onClick={this.onSaveClip} bsStyle="primary">Save</Button>
          </Modal.Footer>

        </Modal.Dialog>
      );
    }

    return (
      <div>
        <ButtonToolbar>
          <ButtonGroup>
            <Button bsStyle="danger" onClick={this.onResumeLive}>
              <Glyphicon glyph="remove" />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button onClick={this.onGotoStart}>
              <Glyphicon glyph="step-backward"/>
            </Button>
            <Button onClick={this.onRewind}>
              <Glyphicon glyph="backward"/>
            </Button>
            <Button
              onClick={this.onPlayOrStop}
              bsStyle={this.state.device.mode === 'play' ? 'primary' : 'default'}>
              <Glyphicon glyph={this.state.device.mode === 'play' ? 'stop' : 'play'}/>
            </Button>
            <Button onClick={this.onFastForward}>
              <Glyphicon glyph="forward"/>
            </Button>
            <Button onClick={this.onGotoEnd}>
              <Glyphicon glyph="step-forward"/>
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button
              onClick={this.onToggleRepeat}
              bsStyle={this.state.device.repeat ? 'info' : 'default'}>
              <Glyphicon glyph="repeat" active="true"/>
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <DropdownButton
              title={scissorsGlpyhicon}
              onSelect={this.onSelectTrim}>
              <MenuItem eventKey="before">Trim from Start</MenuItem>
              <MenuItem eventKey="after">Trim to End</MenuItem>
            </DropdownButton>
          </ButtonGroup>
          <ButtonGroup>
            {loadClipDropdown}
            <Button onClick={this.onShowSaveDialog}>
              <Glyphicon glyph="floppy-open"/>
            </Button>
          </ButtonGroup>
          <Label>{this.state.device.msg}</Label>
        </ButtonToolbar>
        {activeDialog}
      </div>
    );
  }
}

export default class Diag extends React.Component {
  state = {
    camera: null,
    paused: false,
    view: 'Summary',
  };

  constructor() {
    super();
    localforage.getItem('diag-active-view').then((view) => {
      // TODO: This is a little racy but probably ok.  If this promise doesn't
      // resolve before the component is first rendered (unlikely) then the
      // incorrect view will be shown.
      if (typeof view === 'string') {
        this.setState({ view });
      }
    });
  }

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
    let camera = this.state.camera;
    if (camera) {
      camera.logging = false;
      camera.removeListener('diag', this.onDiag);
    }
  }

  onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.logging = false;
      oldCamera.removeListener('diag', this.onDiag);
    }
    if (newCamera) {
      newCamera.logging = true;
      newCamera.on('diag', this.onDiag);
    }
    this.setState({ camera: newCamera });
  };

  onDiag = () => {
    this.forceUpdate(); // TODO: log data is updated as a state side-effect. Naughty
  };

  onPause = () => {
    let paused = !this.state.paused;
    log.info(`paused=${paused}`);
    this.setState({paused});
  };

  onReboot = (channel) => {
    this.state.camera.reboot(channel);
  };

  onView = (view) => {
    localforage.setItem('diag-active-view', view);
    this.setState({view});
  };

  render() {
    let style = {
      margin: 0,
      padding: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: this.state.paused ? 'papayawhip' : 'white',
    };

    let { camera, paused } = this.state;
    if (!camera || !camera.diagOnline) {
      return <div>Waiting for camera {this.deviceId} to connect ...</div>;
    }

    let view;
    switch (this.state.view) {
    case 'Summary':
      view = (
        <DiagLog
          logName="dash"
          log={camera.logs.dash}
          paused={paused}
        />
      );
      break;
    case 'Images':
      view = (
        <DiagImageTable
          style={{ overflowX: 'scroll'}}
          camera={camera}
          paused={paused}
        />
      );
      break;
    default:
      view = <b>Unknown view: {this.state.view}</b>;
      break;
    }

    return (
      <div style={style}>
        <ButtonToolbar>
          <ButtonGroup>
            <Button bsStyle="warning">
              <Link to="/"><Glyphicon glyph="home" /></Link>
            </Button>
            <Button onClick={this.onPause}>
              <Glyphicon glyph={ paused ? 'play' : 'pause' } />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <DropdownButton
              id="view" title={`View: ${this.state.view}`} onSelect={this.onView}>
              <MenuItem eventKey="Summary">Summary</MenuItem>
              <MenuItem eventKey="Images">Images</MenuItem>
            </DropdownButton>
          </ButtonGroup>
          <ButtonGroup>
            <DropdownButton
              id="reboot" title="Reboot to" onSelect={this.onReboot}>
              <MenuItem eventKey="">Current channel</MenuItem>
              <MenuItem eventKey="master">master</MenuItem>
              <MenuItem eventKey="next">next</MenuItem>
              <MenuItem eventKey="release">release</MenuItem>
            </DropdownButton>
          </ButtonGroup>
          <DiagCameraToolbar camera={camera} />
        </ButtonToolbar>
        <div>
          <div style={{flex: 1, display: 'flex', flexDirection: 'row'}}>
            <DiagLogcat logName="logcat" log={camera.logs.logcat} paused={paused}/>
            <div>
              <CameraPreview deviceId={this.deviceId} paused={paused}/>
            </div>
          </div>
          {view}
        </div>
      </div>
    );
  }
}

class DiagLog extends React.Component {
  static propTypes = {
    logName: React.PropTypes.string.isRequired,
    log: React.PropTypes.string,
    paused: React.PropTypes.bool,
  };

  style = {
    flex: 2,
    fontFamily: 'monospace',
    fontSize: '8px',
    overflowY: 'scroll',
    overflowX: 'hidden',
    margin: 2,
    padding: 5,
    borderStyle: 'solid',
    borderColor: '#D3D3D3',
    borderWidth: 2,
  };

  shouldComponentUpdate() {
    return !this.props.paused;
  }

  render() {
    return <pre style={this.style}>{this.props.log || this.props.logName}</pre>;
  }
}


class DiagLogcat extends DiagLog {
  static propTypes = {
    logName: React.PropTypes.string.isRequired,
    log: React.PropTypes.array,
    paused: React.PropTypes.bool,
  };

  constructor(props) {
    super(props);
    this.state = { filter: '' };
    this.style.height = '200px'; // TODO: Use camera preview height or something
    this.style.display = 'block';
  }

  onFilterChange = e => {
    this.setState({ filter: e.target.value });
  };

  render() {
    if (!this.props.log) {
      return super.render();
    }

    let log = this.props.log;
    // The empty pattern is found in any text.  'i' means case
    // insensitive.
    let filterRx;
    try {
      filterRx = new RegExp(this.state.filter, 'i');
    } catch (e) {
      filterRx = /INVALID/;
    }
    return (
      <div style={this.style}>
        {
          log.filter(line => 0 <= line.search(filterRx))
             .map(line => {
               let html = ansiUp.ansi_to_html(line);
               // NOTE: ansi_to_html() will also escape HTML
               // characters (&, <) so using "dangerouslySetInnerHTML"
               // should be safe
               // eslint-disable-next-line react/no-danger
               return <div dangerouslySetInnerHTML={{__html: html}} />;
             })
        }
        <Input style={{fontFamily: 'monospace', fontSize: '8px'}}
          ref="filter"
          type="text"
          placeholder="Filter regexp"
          onChange={this.onFilterChange}
        />
      </div>
    );
  }

  componentDidUpdate() {
    let dom = ReactDOM.findDOMNode(this);
    dom.scrollTop = dom.scrollHeight;
  }
}
