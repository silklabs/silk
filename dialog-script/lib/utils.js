/**
 * @flow
 */
import moment from 'moment';

const iso8601extended = /^\d{4}(-\d{2}(-\d{2}([T ]\d{2}(:\d{2}(:\d{2})?)?([,.]\d+)?(Z|[+-]\d{2}(:\d{2})?)?)?)?)?$/;
const iso8601basic = new RegExp(iso8601extended.source.replace(/[:-]\\d/g, '\\d'));

export function urlEncodeParams(obj: Object): string {
  const list = [];
  Object.keys(obj).forEach(key => {
    list.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
  });
  return list.join(`&`);
}

// Reference https://www.w3.org/TR/2005/NOTE-ssml-sayas-20050526/#S3.3
type NumberFormat = 'telephone' | 'cardinal' | 'ordinal';

export function encodeNumber(digits: number, format: NumberFormat = 'telephone'): string {
  return `<say-as interpret-as=\"${format}\">${digits}</say-as>`;
}

// Reference https://msdn.microsoft.com/en-us/library/hh378462.aspx
// and https://msdn.microsoft.com/en-us/library/jj127898.aspx#Characteristics
type Rate = 'x-slow,'| 'slow' | 'medium' | 'fast' | 'x-fast';
export function encodeRate(text: string, rate: Rate = 'medium'): string {
  return `<prosody rate=\"${rate}\">${text}</prosody>`;
}

// Reference https://msdn.microsoft.com/en-us/library/hh362936.aspx
type Strength = 'none' | 'x-weak' | 'weak' | 'medium' | 'strong' | 'x-strong'
export function encodeBreak(text: string, strength: Strength = 'medium'): string {
  return `<break strength=\"${strength}\"/>${text}`;
}

/**
 * Parse an ISO 8601 formatted string to date
 */
export function parseIso8601(s: string, useLocal: boolean) {
  s = s.replace(/,/g, '.');
  let matches = iso8601extended.exec(s);
  if (matches) {
    s = s.substr(0, 10).replace(/-/g, '') + s.substr(10).replace(/:/g, '');
  }
  matches = iso8601basic.exec(s);
  if (!matches) {
    return null;
  }
  let d = new Date();
  let year = parseInt(matches[0].substring(0, 4));
  let month = matches[1] ? parseInt(matches[1].substr(0, 2)) - 1 : 0;
  let day = matches[2] ? parseInt(matches[2].substr(0, 2)) : 1;
  d.setUTCFullYear(year);
  d.setUTCMonth(month, day);
  let hours = 0, minutes = 0, seconds = 0, milliseconds = 0;
  let fraction = matches[6] ? parseFloat(matches[6]) : 0;
  if (matches[3]) {
    hours = parseInt(matches[3].substr(1, 2));
    if (matches[4]) {
      minutes = parseInt(matches[4].substr(0, 2));
      if (matches[5]) {
        seconds = parseInt(matches[5].substr(0, 2));
        milliseconds = 1000 * fraction;
      } else {
        seconds = 60 * fraction;
      }
    } else {
      minutes = 60 * fraction;
    }
  }
  if (useLocal && !matches[7]) {
    d.setHours(hours);
    d.setMinutes(minutes);
  } else {
    d.setUTCHours(hours);
    d.setUTCMinutes(minutes);
  }
  d.setUTCSeconds(seconds);
  d.setUTCMilliseconds(milliseconds);
  if (matches[7] && matches[7] !== 'Z') {
    let offset = parseInt(matches[7].substr(1, 2)) * 60;
    if (matches[8]) {
      offset += parseInt(matches[8].substr(0, 2));
    }
    d.setTime(d.getTime() + 60000 * offset * (matches[7].substr(0, 1) === '-' ? 1 : -1));
  }
  return d;
}

export function getDateTime(time?: number): Array<string> {
  const now = time ? new Date(time) : new Date();
  let hour = now.getHours() % 12;
  if (hour === 0) {
    hour = 12;
  }
  const minutes = now.getMinutes();
  const am = now.getHours() < 12;
  const dateString = moment(now).format('Do [of] MMMM');

  // TODO: More clever variations? (e.g. "half past 5").
  const timeString = `${hour} ${((minutes > 0 && minutes < 10) ? 'oh ' : '')}` +
                     `${(minutes > 0 ? minutes : 'o\'clock')} ` +
                     `${(am ? 'AM' : 'PM')}`;
  return [timeString, dateString];
}
