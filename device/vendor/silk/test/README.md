#silk-test

## How to run the tests
```
./run
```

## Development Cycle
* Create a new test file under lib/test/ folder
* Compile vendor/silk/test. This is done primarily to babelify the test files
* Copy the test file along with rest of the required test modules by running |make install| or
you can alternatively run |./watch --no-restart| in a separate terminal to watch for any changes
in test script and copy the files automatically to the device without needing a restart.

## Limitations
* Since only the browserified version of files under silk-core is copied on the device the test
scripts can not access these classes using regular require. The file lib/framework.js is provided
to make these classes available to test scripts.
* The path to files under silk-core is specified using NODE_PATH variable in package.json of test module
* Only the modules listed under _dependencies_ section in package.json are copied on the device in order
to save space.
* Test module is only installed on the device for eng and userdebug builds.

