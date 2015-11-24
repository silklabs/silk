# Creating a Heroku dev instance
To set up a development instance of the silk-releng Heroku server for developing
new features or testing fixes:

1. `heroku fork --from silk-releng --to $(whoami)-releng`
2. Update the connected Github project from within the [Horoku
   Dashboard](https://dashboard.heroku.com/apps/) to your releng fork.  For more see
   https://devcenter.heroku.com/articles/github-integration#enabling-github-integration
3. Use manual deploy whenever you want to start/update your dev instance (or get fancier)
4. To hook up your instance to Github for all of Silk Labs, goto
https://github.com/organizations/silklabs/settings/hooks and manually replicate
the settings for the "https://silk-releng.herokuapp.com/hooks/github" hook.
Alternatively you can set up a similar Github webhook just for your local
projects.
