import child_process from 'child_process';
import events from 'events';

const browserify = require('browserify'),
      gulp = require('gulp'),
      minimist = require('minimist'),
      source = require('vinyl-source-stream');

const {
  babel,
  cached,
  clean,
  concat,
  jshint,
  pipe,
  print,
  run,
  sequence,
  sourcemaps,
  tasks,
  traceur,
  uglify
} = require('gulp-load-plugins')();

const args = minimist(process.argv.slice(2));

const result = tasks(gulp, require);
if (typeof result === 'string') console.log(result);

const p = name => print(file => console.log(name, file));

gulp.task('default', ['build']);


gulp.task('build', sequence('clean', 'runtime'));
gulp.task('package', ['uglify'], () => console.log(`App written to ${paths.package}/app.js !`));

gulp.task('run', () => run(`node ${paths.dist}/index.js ${args.args || ''}`).exec());
gulp.task('test', () => run(`node ${paths.dist}/tests/index.js ${args.args || ''}`).exec());

gulp.task('watch', ['runtime'], () => gulp.watch(paths.script, ['runtime']));
gulp.task('dev', ['start_dev'], () => gulp.watch(paths.scripts, ['start_dev']));

gulp.task('transpile', ['jshint'],
  () => pipe([
    gulp.src(paths.scripts)
    ,cached('transpile')
    ,p('transpile')
    ,sourcemaps.init()
    ,babel()
    // ,traceur({modules: 'commonjs', asyncGenerators: true, forOn: true, asyncFunctions: true})
    ,sourcemaps.write('.')
    ,gulp.dest(paths.dist)
  ])
  .on('error', function(e) { console.log(e); }));

gulp.task('runtime', ['transpile'],
  () => pipe([
    // gulp.src([traceur.RUNTIME_PATH])
    // ,p('runtime')
    // ,concat('traceur-runtime.js')
    // ,gulp.dest(paths.dist)
  ])
  .on('error', function(e) { console.log(e); }));

let devChild = {process: undefined};
gulp.task('start_dev', ['runtime', 'terminate'],
  () => {
    const process = devChild.process = child_process.fork(`./${paths.dist}/index.js`);

    devChild.doneFn = () => {
      const {emitter} = devChild;
      if (emitter) emitter.emit('end');
    };

    process.on('exit', (code, signal) => {
      devChild.process = undefined;
      if (devChild.terminateFn) devChild.terminateFn();
    });

    devChild.emitter = new events.EventEmitter();

    return devChild.emitter;
  });

gulp.task('terminate',
  done => {
    const {process, doneFn} = devChild;

    if (process) {
      devChild.terminateFn = () => {
        console.log('terminated');
        done();
      };
      doneFn();
      process.kill();
    }
    else done();
  });

gulp.task('uglify', ['bundle'],
  () => pipe([
    gulp.src([`./${paths.package}/app.js`])
    ,p('uglify')
    ,uglify()
    ,gulp.dest(paths.package)
  ]));

gulp.task('bundle', ['runtime'],
  () => pipe([
    browserify({
      entries: [`./${paths.dist}/index.js`],
      builtins: false,
      detectGlobals: false
    }).bundle()
    ,source('app.js')
    ,p('bundle')
    ,gulp.dest(paths.package)
  ]));

gulp.task('jshint',
  () => pipe([
    gulp.src(paths.scripts)
    ,cached('jshint')
    ,p('jshint')
    ,jshint()
    ,jshint.reporter('jshint-stylish')
    ,jshint.reporter('fail')
  ]));

gulp.task('clean',
  () => pipe([
    gulp.src(paths.dist, {read: false})
    ,clean()
  ]));

const paths = {
  scripts: ['src/**/*.js'],
  dist: '.dist',
  package: '.package'
};
