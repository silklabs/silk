
## Releng Services

### Github WebHook

Releng runs a Github webhook, implemented on a Heroku server, that provides its customers with:
* automated merging of `next` commits back to `master` branches
* a convenient **automerge** label that enables PRs to be merged immediately upon a successfully CI result

### Nightly animation

Nightly automation is run to update the "repocache" tarballs used to speed up
silk-device developer sync times, and other useful tasks.
To trigger manually run `npm run triggerbuilds`.

## Status

Heroku server logs can be viewed:

    heroku logs --tail --app silk-releng

or [https://papertrailapp.com/systems/silk-releng/events](https://addons-sso.heroku.com/apps/silk-releng/addons/16a0bd41-7cc1-4e0d-9c1c-3a258faf77a5).

Heroku configuration is at https://dashboard.heroku.com/apps/silk-releng

To examine recent Github Webhook deliveries, view the **Recent Deliveries** section of
https://github.com/organizations/silklabs/settings/hooks/5939271

The nightly repocache builds are visible at https://magnum.travis-ci.com/silklabs/releng/builds and are the builds named " Updating repocache for *xxx* gonk".

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
  * Configure the scheduler to run `npm run triggerbuilds` every day

### Github WebHook

Goto https://github.com/organizations/silklabs/settings/hooks/new:

* Payload URL : https://silk-releng.herokuapp.com/hooks/github
* Content type: `application/json`
* Secret: `mousenuts` (or use something else set as the GITHUB_SECRET in Heroku)
* Select "Let me select individual events":
  * [X] Pull Request
  * [X] Status
* Click "Add webhook"
