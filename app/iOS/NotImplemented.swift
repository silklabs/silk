func NOT_IMPLEMENTED() {
  let e = NSException(name: "Not implemented", reason: "This method is not implemented", userInfo: nil)
  NSException.raise("Exception", format:"Error: %@", arguments: getVaList([e]))
}