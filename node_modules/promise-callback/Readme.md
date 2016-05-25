There are two ways to use this library/function.

1. Call the function on a standard Node.js async function that takes a callback function with a signature like `(error, ...rest)` and receive a promise that will resolve to whatever the callback would have returned. If the callback would receive more than one argument other than the error argument, the promise will resolve to an object with the arguments in an array named `args`.

````
import fs from 'fs';
import promise from 'promise-callback';

promise(fs.readFile, 'file_name.json')
  .then(
    buffer => console.log(buffer.toString())),
    error  => console.log('error reading file' error.stack));

promise(fs.writeFile, 'file_name.json', JSON.stringify({some: 'js obj'}, null, '  '))
  .then(
       () => console.log('file written'),
    error => console.log('error writting file', error.stack));


//Not working
promise(callback => callback(1, 2, 3))
  .then(
    ({args}) => console.log(...args),
    error => console.log('error!', error.stack));
````

2. Call the function on an object that contains functions like those you would use in way 1.

````
import fs from 'fs';
import promise from 'promise-callback';

const pfs = promise(fs);

fs.readFile(, 'file_name.json')
  .then(
    buffer => console.log(buffer.toSTring()))),
    error  => console.log('Error reading file', error.stack));

````