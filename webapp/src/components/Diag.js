
import ansiUp from 'ansi_up';
import moment from 'moment';
import React from 'react';
import ReactDOM from 'react-dom';
import { Button, ButtonGroup, ButtonToolbar, DropdownButton, Glyphicon,
         Input, MenuItem, Table } from 'react-bootstrap';
import { Link } from 'react-router';
import createLog from 'silk-log';

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
}

type DiagImgFrame = {
  id: string;
  when: number;
  img: JpegImgTag;
}

class DiagImageTable extends React.Component {
  static propTypes = {
    camera: React.PropTypes.object.isRequired,
    paused: React.PropTypes.bool,
  };

  MAX_IMAGE_ROWS = 30 * 4; // = 30 seconds * 4 preview frames/second

  state = {
    images: {},
    imageKeys: [],
  };

  shouldComponentUpdate() {
    return !this.props.paused;
  }

  componentWillMount() {
    this.props.camera.on('diagJpegFrames', this.onDiagJpegFrames);
  }

  componentWillUnmount() {
    this.props.camera.removeListener('diagJpegFrames',
      this.onDiagJpegFrames);

    const { images, imageKeys } = this.state;
    imageKeys.forEach(key => {
      images[key].forEach(info => info.img.deinit());
    });
  }


  addNewJpegs(loadedJpegs: Array<DiagImgFrame>) {
    let images = this.state.images;

    loadedJpegs.forEach(info => {
      const {id, when, img} = info;
      if (images[when]) {
        images[when].push({id, img});
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
  }

  render() {
    let { images, imageKeys } = this.state;
    return (
        <Table striped bordered condensed hover>
          <thead>
            <tr>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
          {
            imageKeys.map(key => {
              const time = moment(parseInt(key, 10)).format('hh:mm:ss.SSS');
              return (
                <tr key={key}>
                  <td style={{verticalAlign: 'middle'}}>{time}</td>
                  {
                    images[key].map(info => {
                      let {id, img} = info;
                      return (
                        <td key={id}>
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
    );
  }
}

export default class Diag extends React.Component {
  state = {
    camera: null,
    paused: false,
    view: 'Summary',
  };

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

  onReboot = (e, channel) => {
    this.state.camera.reboot(channel);
  };

  onView = (e, view) => {
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
    if (!camera || !camera.online) {
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
        </ButtonToolbar>
        <div style={style}>
          <div style={{flex: 1, display: 'flex', flexDirection: 'row'}}>
            <DiagLogcat logName="logcat" log={camera.logs.logcat} paused={paused}/>
            <div>
              <CameraPreview deviceId={this.deviceId} paused={paused}/>
            </div>
          </div>
          <div style={{flex: 2}}>
            {view}
          </div>
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
    fontSize: '8',
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
  }

  constructor(props) {
    super(props);
    this.state = { filter: '' };
    this.style.flex = 1;
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
    } catch(e) {
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
               return <div dangerouslySetInnerHTML={{__html: html}} />;
             })
        }
        <Input
          style={this.style}
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
