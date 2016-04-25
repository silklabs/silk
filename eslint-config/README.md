# Silk eslint rules

 The path of the righteous man is beset on all sides by the inequities
 of the selfish and the tyranny of evil men. Blessed is he, who in the
 name of charity and good will, shepherds the weak through the valley
 of darkness, for he is truly his brother's keeper and the finder of
 lost children. And I will strike down upon thee with great vengeance
 and furious anger those who would attempt to poison and destroy my
 brothers. And you will know my name is the Lord when I lay my
 vengeance upon thee.

## Usage

To use these rules in your package, declare `eslint-config-silk` as a
dependency and declare the necessary peer dependencies as well, e.g.:
```json
{
  "name": "silk-frobnicator",
  "devDependencies": {
    "babel-eslint": "5.0.0",
    "eslint": "1.10.3",
    "eslint-config-silk": "file:../eslint-config",
    "eslint-plugin-react": "3.16.1"
  },
  "scripts": {
    "lint": "eslint src"
  }
}
```

In your package's `.eslintrc`, all you need to do is refer to the
`eslint-config-silk` package:
```json
{
  "extends": "eslint-config-silk",
  "rules": {}
}
```

That's it! If you need React support, you can also extend
`eslint-config-silk/react`. Keep in mind that that will require an
additional peer dependency, `eslint-plugin-react`.

Please refrain from disabling any rules in your local `.eslintrc`. The
point of a common coding style is that it's common.
