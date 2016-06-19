# mdextract

Extracts `/** code comments */` from code files and turns them into markdown 
docs. Supports JavaScript-style comments (other languages to come).

    $ npm install -g mdextract
    $ mdextract --help

Use it to extract comments into a doc:

    $ mdextract file.js > docs.md

Or update a doc:

    $ cat README.md

      add `include` comments to your markdown file

      <!-- include: file.js -->
      <!-- /include: file.js -->

    $ mdextract --update README.md

...the `--update` mode is great for making Readme-based documentation in small 
projects. It is [idempotent].

File format
-----------

__Sections:__ mark them with comments beginning with two stars.

```
/**
 * Sections:
 * Start your sections with two stars.
 *
 * If your first line of text ends in a colon (:), it will be turned into an
 * `<h3>` heading.
 */
```

__Main sections:__ three stars.

```
/***
 * Main sections:
 * If you start sections with three stars, the headings will be turned into
 * `<h2>` headings.
 */
```

__Code blocks:__ They will be converted into syntax-highlighted code fences.

```
/**
 * An example:
 *
 *     function () {
 *       return true;
 *     }
 */
```

__Definition lists:__ Use `~` as a bullet. Great for parameter lists.

```
/**
 * ~ name: description
 * ~ id: the identifier
 * ~ callback (Function): the callback to run afterwards
 */
```

__Sample usage:__ Use `name : usage` as your first line to specify a sample 
usage.

```
/**
 * push : push(name, fn)
 * Adds an item to the stack.
 */
```

__Single-line mode:__ for short documentations.

```js
/** id: the identifier. */
this.id = null;

/** name: the name. */
this.name = "Hello";
```

Examples
--------

 * [index.js](index.js) from mdextract ([output](API.md))
 * [navstack.js] from Navstack ([output][navstack-out])

[navstack.js]: https://github.com/rstacruz/navstack/blob/master/navstack.js
[navstack-out]: https://github.com/rstacruz/navstack/blob/master/Readme.md

Thanks
------

**mdextract** © 2014+, Rico Sta. Cruz. Released under the [MIT License].<br>
Authored and maintained by Rico Sta. Cruz with help from [contributors].

> [ricostacruz.com](http://ricostacruz.com) &nbsp;&middot;&nbsp;
> GitHub [@rstacruz](https://github.com/rstacruz) &nbsp;&middot;&nbsp;
> Twitter [@rstacruz](https://twitter.com/rstacruz)

[MIT License]: http://mit-license.org/
[contributors]: http://github.com/rstacruz/mdextract/contributors
[idempotent]: https://en.wikipedia.org/wiki/Idempotent
