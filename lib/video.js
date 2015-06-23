/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let fs = require('fs');
let path = require('path');
let spawn = require('child_process').spawn;

const FFMPEG_LOG_SPEW = true;

function mkdir(dir) {
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e;
    }
    console.log('Warning: dir', dir, 'already exists');
  }
}

class StreamManager {
  constructor(dir) {
    this.dir = dir;
    this.jobs = { };
    mkdir(this.dir);
  }

  onmsg(io, msg) {
    if (!(msg.id in this.jobs)) {
      this.createSegmentJob(io, msg);
    }
    let job = this.jobs[msg.id];
    return ((0 == msg.frame.length) ?
            job.ffmpeg.stdin.end() : job.ffmpeg.stdin.write(msg.frame));
  }

  createSegmentJob(io, msg) {
    console.log('Starting segmenting job for', msg.id);

    let job = { ffmpeg: null, nextSegment: 0,
                // Keep me in sync with pattern below.
                nextSegmentName: 'seg0000' };
    let dir = path.join(this.dir, msg.id);
    mkdir(dir);
    job.ffmpeg = spawn('ffmpeg',
                       [ '-r', '21',
                         '-i', 'pipe:0', // stdin
                         '-force_key_frames', 'expr:gte(t,n_forced*1)',
                         '-vcodec', 'libx264',
                         '-profile:v', 'baseline',
                         '-f', 'segment',
                         '-segment_list', dir + '/index.m3u8',
                         '-segment_time', '1',
                         '-segment_list_flags', 'live',
                         dir + '/seg%04d.ts' ]);
    fs.watch(dir, (event, filename) => {
      let name = path.parse(filename);
      if (name.ext !== '.ts') {
        return;
      }
      let match = /seg(\d+)/.exec(name.name);
      if (!match) {
        return;
      }
      let id = parseInt(match[1]);
      if (id <= job.nextSegment) {
        return;
      }
      console.log('  new segment', job.nextSegment, 'ready');
      let curSegmentName = job.nextSegmentName;
      ++job.nextSegment;
      job.nextSegmentName = name.name;

      let ts = path.join(dir, curSegmentName + '.ts');
      let mp4 = path.join(dir, curSegmentName + '.mp4');
      let rewrap = spawn('ffmpeg', [ '-i', ts, '-vcodec', 'copy', mp4 ]);
      rewrap.on('close', () => {
        console.log('  rewrapped segment', curSegmentName);
        fs.readFile(mp4, (err, data) => {
          if (err) {
            return console.log('Error reading', mp4 +':', err);
          }
          io.to('logging').emit('video', { id: msg.id, name: msg.name,
                                           frame: data });
        });
      });
    });
    job.ffmpeg.on('close', () => {
      console.log('ffmpeg died for', msg.id);
      delete this.jobs[msg.id];
    });
    if (FFMPEG_LOG_SPEW) {
      job.ffmpeg.stdout.on('data', data => console.log(msg.id,
                                                       data.toString('utf8')));
      job.ffmpeg.stderr.on('data', data => console.log(msg.id,
                                                       data.toString('utf8')));
    }
    this.jobs[msg.id] = job;
  }
}

module.exports = (dir) => new StreamManager(dir);
