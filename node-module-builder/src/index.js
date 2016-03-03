/**
 * The goal of the node modules builder is to provide an interface (on OSX only)
 * to compile native node modules for both linux and OSX and place them into
 * build-(arch) folders so a single `node_modules` folder can contain both linux
 * and OSX dependencies.
 */

import assert from 'assert';
import path from 'path';

import eventToPromise from 'event-to-promise';
import archiver from 'archiver';
import tarFs from 'tar-fs';

import dockerFactory from './docker_factory';

const CONTAINER_PUT_PATH = '/home/builder/workspace/';
const CONTAINER_BUILD_PATH = '/home/builder/workspace/build/';

export default class Builder {
  docker = dockerFactory();

  _pendingEnsureImage = null;

  constructor(image) {
    assert(typeof image === 'string', 'must pass image.');
    this.image = image;
  }

  ensureImage() {
    if (this._pendingEnsureImage) {
      return this._pendingEnsureImage;
    }

    this._pendingEnsureImage = this._ensureImage().
      then(() => this._ensureImage = null).
      catch((err) => {
        this._pendingEnsureImage = null;
        throw err;
      });

    return this._pendingEnsureImage;
  }

  async _ensureImage() {
    let images = await this.docker.listImages({});
    let imageSet = images.reduce((result, image) => {
      result.add(image.RepoTags[0]);
      return result;
    }, new Set());

    if (imageSet.has(this.image)) {
      return;
    }

    let pullStream = await this.docker.pull(this.image, {});
    process.stdout.pipe(pullStream);
    await eventToPromise(pullStream, 'finish');
  }

  /**
   * "upload" a node module to be compiled on linux.
   *
   * @param {String} src The source node module on the host.
   * @param {String} dest The destination of the compiled build on the host.
   * @param {Bool} verbose output the docker logs ?
   */
  async compile(src, dest, verbose = true) {
    await this.ensureImage();

    // Prime the input archive ...
    let inputArchive = tarFs.pack(src);

    // Create the new container ...
    let { id } = await this.docker.createContainer({
      Image: this.image
    });

    let container = this.docker.getContainer(id);
    let ins = await container.inspect();

    let result = await container.putArchive(inputArchive, {
      path: CONTAINER_PUT_PATH
    });

    await container.start();

    if (verbose) {
      let logs = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
      });

      container.$subject.modem.demuxStream(
        logs,
        process.stdout,
        process.stderr,
      );
    }

    let wait = await container.wait();
    let output = await container.getArchive({
      path: CONTAINER_BUILD_PATH
    });

    let extract = tarFs.extract(dest, { strip: 1 });
    output.pipe(extract);
    await eventToPromise(extract, 'finish');
  }
}
