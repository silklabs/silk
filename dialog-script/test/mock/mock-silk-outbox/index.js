/**
 * @noflow
 */

class Outbox {
  addToQueue(operation, readable) {
  }
}

export function getOutboxInstance() {
  return new Outbox();
}

export class PosKeywordUploadOperation {
  static NAME = 'keyword-upload';
  static META_TYPE = 'keyword_pos';
  static CONTENT_TYPE = 'audio/wav';
}
