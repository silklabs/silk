# gulp-gitignore [![Build Status](https://travis-ci.org/Thomas-Lebeau/gulp-gitignore.svg?branch=master)](https://travis-ci.org/Thomas-Lebeau/gulp-gitignore)

> Exlude files defined on .gitignore from the stream


## Install

```
$ npm install --save-dev gulp-gitignore
```


## Usage

```js
var gulp = require('gulp');
var gitignore = require('gulp-gitignore');

gulp.task('default', function () {
    return gulp.src('src/**/*')
        // exclude files defined in .gitignore
        .pipe(gitignore())
        .pipe(gulp.dest('dist'));
});
```


## API

### gitignore(file, [pattern],[options])

#### file

Type: `string`
Default: `.gitignore`

The `.gitignore` file.

#### pattern

Type: `array`

You can optionally pass an additional array of patterns to exlude from the stream.
```js
gitignore('.gitignore', ['foo', 'bar']);
```

#### options

Type: `object`

##### options.dot

Type: `boolean`  
Default: `false`

Matches files prefixed with a dot (eg. `.DS_Store`).


## License

MIT © [Thomas Lebeau](https://github.com/Thomas-Lebeau)
