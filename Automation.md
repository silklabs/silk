
## Releng Services

### Github WebHook

Releng runs a Github webhook, implemented on a Heroku server, that provides its customers with:
* automated merging of `next` commits back to `master` branches
* a convenient **automerge** label that enables PRs to be merged immediately upon a successfully CI result

### Repocache

Nightly automation updates the "repocache" tarballs used to speed up
silk-device developer sync times.  To trigger an update manually, run `npm run
repocache`.

## Status

Heroku server logs can be viewed:

    heroku logs --tail --app silk-releng

Heroku configuration is at https://dashboard.heroku.com/apps/silk-releng

To examine state from the github side, view the **Recent Deliveries** at
https://github.com/organizations/silklabs/settings/hooks/5939271


## Setup

### Heroku Server

* Deploy Tab:
  * Connect to `silklabs/releng` github project
  * Enable "Automatic deploys"
    * [X] Wait CI to pass before deploy
* Settings Tab-> Config Variables:
  * Create GITHUB_TOKEN with a silk-stooge owned token created with 'repo' scope (invalid example: `e1fe6d9192e2406e880a73cf1e721eb65cb2e2f3`)
  * Create a GITHUB_SECRET token that matches the Github webhook secret
* Resources Tab -> Add-ons:
  * Add 'Heroku Scheduler'
  * Configure the scheduler to run `npm run next2master` every hour
  * Configure the scheduler to run `npm run repocache` every day

### Github WebHook

Goto https://github.com/organizations/silklabs/settings/hooks/new:

* Payload URL : https://silk-releng.herokuapp.com/hooks/github
* Content type: `application/json`
* Secret: `mousenuts` (or use something else set as the GITHUB_SECRET in Heroku)
* Select "Let me select individual events":
  * [X] Pull Request
  * [X] Status
* Click "Add webhook"

