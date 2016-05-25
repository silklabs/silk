import promise from '../';

promise((arg, callback) => {
  console.log('arg', arg, 'callback', callback);
  callback(undefined, 'arg1', 'arg2');
}, 'an arg').then(value => console.log('value', value), error => console.log('error', error));

promise((arg, callback) => {
  console.log('arg', arg, 'callback', callback);
  callback('error', 'arg1', 'arg2');
}, 'an arg').then(value => console.log('value', value), (error, ...rest) => console.log('error', error, ...rest));


import fs from 'fs';

const pfs = promise(fs);

pfs.writeFile('test.txt', 'wut')
   .then(
      () => console.log('written'),
      e  => console.log('error', e.stack));

promise(dummyAsync)
  .then(
    ({args}) => console.log('return', ...args),
    error => console.log('error!', error.stack));

function dummyAsync(callback) {
  setTimeout(() => callback(undefined, 1, 2, 3), 500);
}