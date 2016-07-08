import filer from 'filer/dist/filer';

export default class Files {
  fs = null;
  cwd = '/';

  constructor(namespace = 'local') {
    this.fs = new filer.FileSystem({ name: namespace });
  }

  enumerate() {
    return new Promise((resolve, reject) => {
      this.fs.readdir(this.cwd, (err, files) => {
        if (err) {
          return reject(err);
        }
        return resolve(files);
      });
    });
  }

  read(name) {
    return new Promise((resolve, reject) => {
      this.fs.readFile(this._absolutePath(name), (err, data) => {
        if (err) {
          return reject(err);
        }
        return resolve(data);
      });
    });
  }

  stat(name) {
    return new Promise((resolve, reject) => {
      let path = this._absolutePath(name);
      this.fs.stat(path, (err, stats) => {
        if (err) {
          return reject(err);
        }
        return resolve({ name, path, stats });
      });
    });
  }

  unlink(name) {
    return new Promise((resolve, reject) => {
      let path = this._absolutePath(name);
      this.fs.unlink(path, (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });
  }

  write(name, data) {
    let buffer = new filer.Buffer(data);
    return new Promise((resolve, reject) => {
      this.fs.writeFile(this._absolutePath(name), buffer, (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });
  }

  writev(name, dataArray) {
    let bufferIndex = 0;
    let writeNextBuffer = (fd, position, resolve, reject) => {
      if (bufferIndex === dataArray.length) {
        this.fs.close(fd);
        resolve();
        return;
      }
      let buffer = new filer.Buffer(dataArray[bufferIndex++]);
      this.fs.write(fd, buffer, 0, buffer.length, position, (err, nbytes) => {
        if (err) {
          return reject(err);
        }
        return writeNextBuffer(fd, position + nbytes, resolve, reject);
      });
    };
    return new Promise((resolve, reject) => {
      this.fs.open(this._absolutePath(name), 'w', (err, fd) => {
        if (err) {
          reject(err);
          return;
        }
        // filer claims to follow open() semantics and truncate the
        // file when opened for writing, but it doesn't actually do
        // that.
        this.fs.ftruncate(fd, 0, (err) => {
          if (err) {
            return reject(err);
          }
          return writeNextBuffer(fd, 0, resolve, reject);
        });
      });
    });
  }

  _absolutePath(name) {
    return filer.Path.join(this.cwd, name);
  }
}
