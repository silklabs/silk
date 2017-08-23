/* @noflow */
module.exports = {
  'extends': ['eslint-config-silk', 'plugin:react/recommended'],
  'plugins': [
    'react',
  ],
  'rules': {
    'react/display-name': 0,
    'react/prop-types': 0,
    'react/jsx-closing-bracket-location': [2, {'nonEmpty': 'after-props', 'selfClosing': 'tag-aligned'}],
    'react/jsx-indent-props': [2, 2],
    'react/jsx-no-undef': 2,
    'react/jsx-uses-react': 2,
    'react/react-in-jsx-scope': 2,
  },
};
