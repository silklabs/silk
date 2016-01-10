#!/usr/bin/env node

import { createMilestone } from '../lib/github';

function genMilestones(prefix, number = 5, baseDate, baseNumber = 1,
  incNumber = 1, incDate = 14) {
  let m = [];

  while (number >= 1) {
    let date = new Date();
    date.setTime(baseDate.getTime());
    m.push([`${prefix}${baseNumber}`, date]);

    baseDate.setTime(baseDate.getTime() + 1000 * 60 * 60 * 24 * incDate);
    baseNumber += incNumber;
    number--;
  }
  return m;
}

if (require.main === module) {
  Promise.resolve()
  .then(() => {
    let milestones = genMilestones('Feature', 6, new Date(2016, 0, 8));
    return Promise.all(
      milestones.map(m => createMilestone('silklabs', 'silk-core', m[0], m[1]))
    )
  })
  .catch(exitOnError)
  .then(() => {
    console.log('SUCCESS');
  });
}
