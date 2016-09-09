/**
 * Modified version of https://github.com/finnfiddle/words-to-numbers with the following fixes
 *  - Add support for handling numbers of type zipcode or telephone
 *  - Handle digits with mix case characters in them
 *  - Magnitude without count should default to count of one. For exammple, `hundred`
 *    should be treated as `100` and not `0`.
 *  - Remove dependency on `its-set` module that brings in a few other dependencies
 *  - Remove fuzzy option as we don't need it to avoid bringing 'clj-fuzzy' dependency
 *  - Lint fixes
 *
 * @noFlow
 */

const COUNT = {
  zero: 0,
  a: 1,
  one: 1,
  first: 1,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
  ten: 10,
  tenth: 10,
  eleven: 11,
  eleventh: 11,
  twelve: 12,
  twelfth: 12,
  thirteen: 13,
  thirteenth: 13,
  fourteen: 14,
  fourteenth: 14,
  fifteen: 15,
  fifteenth: 15,
  sixteen: 16,
  sixteenth: 16,
  seventeen: 17,
  seventeenth: 17,
  eighteen: 18,
  eighteenth: 18,
  nineteen: 19,
  nineteenth: 19,
  twenty: 20,
  twentieth: 20,
  thirty: 30,
  thirtieth: 30,
  forty: 40,
  fortieth: 40,
  fifty: 50,
  fiftieth: 50,
  sixty: 60,
  sixtieth: 60,
  seventy: 70,
  seventieth: 70,
  eighty: 80,
  eightieth: 80,
  ninety: 90,
  ninetieth: 90,
};

const MAGNITUDE = {
  hundred: 100,
  hundredth: 100,
  thousand: 1000,
  million: 1000000,
  billion: 1000000000,
  trillion: 1000000000000,
  quadrillion: 1000000000000000,
  quintillion: 1000000000000000000,
  sextillion: 1000000000000000000000,
  septillion: 1000000000000000000000000,
  octillion: 1000000000000000000000000000,
  nonillion: 1000000000000000000000000000000,
  decillion: 1000000000000000000000000000000000,
};

const NUMBER_WORDS = Object.keys(COUNT)
  .concat(Object.keys(MAGNITUDE))
  .concat(['and', 'point']);

const clean = word => word.replace(',', '');

const extractNumberRegions = words => {
  const reduced = words
    .map(word => NUMBER_WORDS.indexOf(clean(word).toLowerCase()) > -1)
    .reduce((acc, isNumberWord, i) => {
      if (isNumberWord) {
        if (acc.start === null) {
          acc.start = i;
        }
      } else if (acc.start) {
        acc.regions.push({start: acc.start, end: i - 1});
        acc.start = null;
      }
      return acc;
    }, {regions: [], start: null});
  return reduced.start === 0 && !reduced.regions.length ? 'whole' : reduced.regions;
};

const convertWordsToDecimal = words =>
  words.map(word => COUNT[word])
    .join('');

const convertWordsToNonDecimal = words => {
  const reduced = words.reduce((acc, word) => {
    const cleanWord = clean(word);
    if (cleanWord === 'and') {
      return acc;
    }
    if (acc.count) {
      if (COUNT[cleanWord]) {
        acc.extra += COUNT[acc.count];
        acc.count = cleanWord;
      } else {
        acc.pairs.push({count: acc.count, magnitude: cleanWord});
        acc.count = null;
      }
    } else {
      if (MAGNITUDE[cleanWord]) {
        acc.pairs.push({count: 'one', magnitude: cleanWord});
      } else {
        acc.count = cleanWord;
      }
      acc.count = cleanWord;
    }
    return acc;
  }, {pairs: [], count: null, extra: 0});

  return reduced.pairs.reduce((acc, pair) =>
    acc + COUNT[pair.count] * MAGNITUDE[pair.magnitude]
  , COUNT[reduced.count] || 0) + reduced.extra;
};

const convertSpelledOutWords = words => {
  const reduced = words.reduce((acc, word) => {
    const cleanWord = clean(word);
    return acc + (COUNT[cleanWord] ? COUNT[cleanWord].toString() : MAGNITUDE[cleanWord].toString());
  }, '');
  return reduced;
};

const convertWordsToNumber = (words, opts) => {
  words = words.map(word => word.toLowerCase());
  const pointIndex = words.indexOf('point');
  if (pointIndex > -1) {
    const numberWords = words.slice(0, pointIndex);
    const decimalWords = words.slice(pointIndex + 1);
    return parseFloat(`${convertWordsToNonDecimal(numberWords)}.${convertWordsToDecimal(decimalWords)}`);
  }
  if (opts.spell) {
    return convertSpelledOutWords(words);
  } else {
    return convertWordsToNonDecimal(words);
  }
};

export default function wordsToNumbers(text, options) {
  const opts = Object.assign({spell: false}, options);
  let words = text.toString().split(/[\s-]+/);
  const regions = extractNumberRegions(words);

  if (regions === 'whole') {
    return convertWordsToNumber(words, opts);
  }

  if (!regions.length) {
    return null;
  }

  let removedWordsCount = 0;
  return regions.map(region =>
    convertWordsToNumber(words.slice(region.start, region.end + 1), opts)
  )
  .reduce((acc, replacedRegion, i) => {
    const removeCount = regions[i].end - regions[i].start + 1;
    const result = acc.slice(0);
    result.splice(regions[i].start - removedWordsCount, removeCount, replacedRegion);
    removedWordsCount += removeCount - 1;
    return result;
  }, words)
  .join(' ');
}
