We use [documentationjs](https://github.com/documentationjs/documentation) to convert code comments to HTML documents

### Silk docs URL
https://silk-webapp-master.herokuapp.com/docs

### Basic Rules
* ```documentationjs``` supports [jsDoc](http://usejsdoc.org/index.html) style code comments.
```js
  /**
   * Test function that takes in two parameters and returns string
   *
   * @param {object} param1 Should preview be enabled or not
   * @param {boolean} param2 Should video be enabled or not
   * @return {string}
   */
  testFunction(param1, param2) {
    return "";
  }
```
*  ```documentationjs``` also understands [flow](https://github.com/facebook/flow) annotations. 
If the code is flowified already then there is no need to specify the parameter types as well as return types.
Above example with flow types can be written as:
```js
  /**
   * Test function that takes in two parameters and returns string
   *
   * @param param1 Should preview be enabled or not
   * @param param2 Should video be enabled or not
   */
  testFunction(param1: Size, param2: boolean): string {
    return "";
  }
```
* Complex Flow type annotation themselves need to be commented
```js
/**
 * Type representing the preview size in width and height
 *
 * @property {number} width preview image width
 * @property {number} height preiview image height
 */
type Size = {
  width: number;
  height: number;
};
```
* Events emmitted by a class can be documented as follows. Note that events can be documented anywhere in the class.
Preferably at the beginning of the class like below. **NOTE:** the use of ```@memberof``` annotation.
This specifies that the event is part of Sensors class or else it would show up in global scope. Also note the use of
```@instance``` annotation that specifies that this event to be registered on the instance of this class and not a static
member.

```js
class Sensors {
  /**
    * Light event. This event is emiited when light sensor level is available
    *
    * @event light
    * @memberof Sensors
    * @instance
    * @type {Object}
    * @property {number} level Light level in SI lux units
    */
}
```
* Its preferable to mark all the internal functions as private so they don't show up in the documentaiton. Functions
with comments show up by default in the API documentation otherwise.
```js
  /**
   * @private
   */
  _internalFuncs() {
  }
```
