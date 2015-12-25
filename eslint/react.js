module.exports = {
  "extends": "eslint-config-silk",
  "ecmaFeatures": {
    "jsx": true
  },
  "plugins": [
    "react"
  ],
  "rules": {
    "react/jsx-indent-props": [2, 2],
    "react/jsx-closing-bracket-location": [2, {"nonEmpty": "after-props", "selfClosing": "tag-aligned"}]
  }
};
