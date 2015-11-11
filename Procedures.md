## Feature Mid-week Landing (master -> next)

FML is a time-based event.  Be kind and remind folks ~12 hours beforehand that
FML is coming via #eng.  It is not recommended to block FML on any particular
change as anything that misses the branch can easily be cherry-picked later by
the owner.

1. Ensure all builds are green at https://magnum.travis-ci.com/silklabs
2. Run `./fml.sh`.  If you want to be extra cautious, reply N to the "BE SURE!!!" prompt and inspect the commits in the `next/` directory to your satisfaction then re-run.
3. Monitor Travis to ensure that all the *master* and *next* builds go green.  This may take a couple hours. 
4. Notify #eng that FML has been completed, reminding folks that *master* is now for milestone + 1 development and that *next* is open for stabilization of the current milestone.

Product Test will now engage to validate that *next* and *master* are performing to expectation.

## Code Complete (next -> release)

CC occurs when there are no open issues for the given milestone and the PE
confirms that the release criteria has been met.  

1. Receive the :shipit: notification from the Project Engineer.
2. Run `./release.sh` (same cautious note from *FML* applies here as well).
3. Monitor Travis to ensure that all the `release` builds go green.  This may take a couple hours. 
4. Notify #eng that the release has been completed.

Product Test will now engage to validate the release.

## Pushing a new app update via TestFlight

We've typically pushed (manual) builds from the `next` branch to TestFlight users, as all current FUT dogfooders are running their devices on the `next` branch as well.

TestFlight builds need to be manually created because they need to ship with the `XC: com.silklabs.Silk` iOS Distribution provisioning profile, as opposed to Travis's builds which include the `CI Build Profile` iOS Development profile and can only run on a specific list of devices. TestFlight on the other hand allows us to add up to 25 iTunes *accounts* for internal testing, independent of the device used.

There are four major steps to generating a manual build:

### Rev the bundle/build version in Xcode

Prior to building and uploading the binary, you need to ensure that the app version in the branch you're building from (mostly likely `next`) is unique and has not yet been used in a TestFlight build. If FML just happened, this is not a concern. But if a TestFlight build has already been uploaded for this cycle, perform the following steps:

0. Ensure the last automated merge from `next` to `master` was performed successfully.
0. Open `Silk.xcodeproj` in Xcode.
0. Select the root node (`Silk`) in the tree view, and increment the 'Version' and 'Build' numbers in the 'General' tab, and commit the change on the `next` branch.
0. Merge `next` to `master`, ignoring the version conflict: `git checkout master && git merge -s ours next`
0. Push both `next` and `master` to `origin`.

### Import the iOS Distribution signing identity

TestFlight builds need to be signed with our distribution signing identity. It consists of a public/private keypair whose public key is known to Apple, but the private key only exists on developer machines. So if you haven't published a TestFlight build yet on your machine, or the certificate has been reset (this is bad, see below), you need to import the private key from a fellow colleague's machine.

WARNING: If you don't have the private key and attempt to upload a TestFlight build anyway, Xcode will helpfully offer to reset or re-create the signing identity for you. DO NOT NEVER EVER DON'T DO THAT. It will revoke the certificate with which existing TestFlight builds are signed, making it impossible for TestFlight users to install or upgrade their app until a new build gets published.

0. Find a fellow colleague who has the current signing identity's private key (e.g. the last person who uploaded a TestFlight build)
0. Have them export the private key:
  0. open Xcode -> Preferences -> Accounts tab
  0. select the <name>@silklabs.com Apple ID if multiple ones are configured
  0. select the "Weave Laboraties Inc" team and click the "View Details..." butotn
  0. right-click on the "iOS Distribution" signing identity and choose "Export"
  0. save the private key file with a passphrase and email/slack/fax it to you
0. Import the private key:
  0. open Keychain Access on your Mac
  0. open the Certificates category view
  0. if you already have an "iPhone Distribution: Weave Laboratories Inc (xxx)" certificate, delete it
  0. drag-and-drop the private key file into the list and enter the passphrase

### Generate and upload the actual build:

0. Close Xcode and any react-native package servers that might be running
0. Create a fresh clone of `silk-app` or get rid of any previous build artifacts by running `git clean -xfd` in your existing clone. (Careful! This will get rid of any local changes and your `config.local.json`!)
0. Install node packages with `npm install`
0. Open `Silk.xcodeproj` in Xcode
0. Perform a sanity check by building + running the app on a real iOS device. Test basic features: account login, live video, configuring a device.
0. Select Product -> Archive to produce a production build of the app
0. Click on the 'Upload to App Store...' button.
0. Confirm the 'Weave Laboratories Inc' development team in the next dialog, and the use of the `XC: com.silklabs.Silk` provisioning profile in the second dialog.

### Enable the new version in iTunes Connect:

0. Log into [iTunes Connect](https://itunesconnect.apple.com)
0. Go to 'My Apps', 'Silk Alpha', and open the 'TestFlight' tab. Click on the 'Select Version to Test' link. The new app version should appear, but if you just uploaded it, it will still say processing.
0. After about half an hour or so, the newly uploaded build should be available for selection.
