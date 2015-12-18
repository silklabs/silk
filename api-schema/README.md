# API Schema + Client Generation

This project both contains the tools to define http (and potentially
other) interfaces and consume them via auto generated clients.

See: [tests](test/server/express_test.js) for usage.
  
This project is to contain the "core" of what we need to define these
interfaces but the primary server project will deal with more complex
issues such as authentication and our company special API(s). This
project may be expanded to support things like swagger/AWS Gateway/API
Docs/etc...

## Developing

```sh
npm install
npm test
```
