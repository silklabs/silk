module.exports = function promise(fn, ...args) {
  if (typeof fn === 'function') {
    return new Promise((resolve, reject) => {
      fn(...args, (error, ...rest) => {
        if (error) reject({error, args: rest});
        else resolve(rest.length === 1 ? rest[0] : rest);
      });
    });
  }
  else if (typeof fn === 'object') {
    const wrapper = {};

    for (let key in fn) {
      const value = fn[key];
      if (typeof value === 'function') {
        wrapper[key] = (...args) => promise(value, ...args);
      }
    }

    return wrapper;
  }

  throw Error('Sorry, I don\'t know how to handle', fn);
};
