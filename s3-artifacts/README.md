# S3 Artifacts Uploader

Travis has limitations on how artifacts are generated and how big the
log must be (4mb). This serves a hack to workaround those issues by
proving a simple to use interface to upload artifacts to a bucket we
manage.

The s3 side of this uses aws-sdk with the `s3.upload` method this will
result in fairly optimized parallel uploads (and chunked multipart
uploads for files > 5mb). We detect the proper content types of all
files via `mime` and store the contents of those files at reduced
redundancy (cost savings). This module will also add an `index.html`
file to the root of the destination providing a way to see what was
uploaded.

## Usage

```sh
npm install -g silklabs/s3-artifacts
silk-artifacts -h
```

## Examples

(From this directory)

```sh
silk-artifacts silk-device test1 test
```
