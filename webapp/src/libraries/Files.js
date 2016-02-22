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
      this.fs.stat(this._absolutePath(name), (err, stats) => {
        if (err) {
          return reject(err);
        }
        return resolve(stats);
      });
    });
  }

  write(name, data) {
    return new Promise((resolve, reject) => {
      this.fs.writeFile(this._absolutePath(name), data, (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });
  }

  _absolutePath(name) {
    return filer.Path.join(this.cwd, name);
  }
}
