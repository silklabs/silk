import assert from 'assert';
import * as Joi from 'joi';
import joiToJsonSchema from 'joi-to-json-schema';
import flowify from '../src/flow';

suite('flow conversions', function() {

  function trim (str) {
    return str.replace(/(\n|\s)+/gm, '');
  }

  test('single level object', async () => {
    let expected = `type ILikeStructs = {
       isString: string;
       isBool: bool;
       isNumber: number;
       isArray: Array<string>;
    };`;

    let schema = Joi.object().keys({
      isString: Joi.string().required(),
      isBool: Joi.bool().required(),
      isNumber: Joi.number().required(),
      isArray: Joi.array().items(Joi.string().required()).required()
    });

    let jsonSchema = joiToJsonSchema(schema);
    let name = 'iLikeStructs';
    let result = flowify(name, jsonSchema);

    assert.equal(trim(result), trim(expected));
  });

  test('array with type', async () => {
    let expected = `type ILikeStructsArr = {
 name: ?string;
};


type ILikeStructs = {
 arr: Array<ILikeStructsArr>;
};`;

    let schema = Joi.object().keys({
      arr: Joi.array().items(Joi.object().keys({
        name: Joi.string()
      })).required()
    });

    let jsonSchema = joiToJsonSchema(schema);
    let name = 'iLikeStructs';
    let result = flowify(name, jsonSchema);

    assert.equal(trim(result), trim(expected));
  });

  test('multi level', async () => {
    let expected = `type ILikeStructsComplexFooBar = {
  string: string;
};

type ILikeStructsComplexFoo = {
  bar: ?ILikeStructsComplexFooBar;
};

type ILikeStructsComplex = {
  foo: ILikeStructsComplexFoo;
};

type ILikeStructs = {
  complex: ILikeStructsComplex;
};`;

    let schema = Joi.object().keys({
      complex: Joi.object().keys({
        foo: Joi.object().keys({
          bar: Joi.object().keys({
            string: Joi.string().required()
          })
        }).required()
      }).required()
    });

    let jsonSchema = joiToJsonSchema(schema);
    let name = 'iLikeStructs';
    let result = flowify(name, jsonSchema);

    assert.equal(trim(result), trim(expected));
  });

});
