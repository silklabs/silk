class Internal {
  foo() {
  }
}

// Ensure we can handle using super.foo
export class MyClass extends Internal {
  constructor() {
    super();
    super.foo();
  }
}

export function sleep (n = 0) {
  return new Promise((accept) => {
    setTimeout(accept, n);
  });
}
