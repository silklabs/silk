We run a two week train model.  New feature development occurs on the *master*
branch and stabilization/test occurs on the *next* branch.  Every two weeks,
*master* is uplifted to *next*, and *next* is uplifted to *release*.

Quick "chemspill" branches may also occur on demand to resolve critical issues
with the current release, and run completely independent to the normal sprint cadence.

Releng is responsible for:
* Ensuring all branches remain green (aka. sheriffing the trees).
* The migration of code from branch to branch in support of release milestones.
* Ensuring that releases are reproducible, both internally and by customers.
* Developing tools to offload Product, Engineering and Test from mundane tasks
  pertaining to the previous items.

To request Releng support, please file an issue [here](https://github.com/silklabs/silk-core/issues/new) with the *releng* label.

## Latest Builds

Branch  | Binaries | Servers
--------|----------| -------
master  | [Nexus 4 Device Image](https://s3-us-west-2.amazonaws.com/silk-device/master/latest/mako.tgz) / [Silk iOS App](https://s3-us-west-2.amazonaws.com/silk-app/master/latest/Silk.ipa) | [Web app](https://silk-webapp-master.herokuapp.com/)
next    | [Nexus 4 Device Image](https://s3-us-west-2.amazonaws.com/silk-device/next/latest/mako.tgz) / [Silk iOS App](https://s3-us-west-2.amazonaws.com/silk-app/next/latest/Silk.ipa) | [Web app](https://silk-webapp-next.herokuapp.com/)
release | [Nexus 4 Device Image](https://s3-us-west-2.amazonaws.com/silk-device/release/latest/mako.tgz) / [Silk iOS App](https://s3-us-west-2.amazonaws.com/silk-app/release/latest/Silk.ipa) | [Web app](https://silk-webapp-release.herokuapp.com/)

## Kickstarter Feature Release Calendar

Milestone Name     |FML    |Release|Issues
-------------------|-------|-------|------
Feature1           |Jan 11 |Jan 22 | [Open](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3AFeature1) / [Closed](https://github.com/issues?q=is%3Aissue+user%3Asilklabs+milestone%3AFeature1+is%3Aclosed)
Feature2           |Jan 25 |Feb 5  | [Open](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3AFeature2) / [Closed](https://github.com/issues?q=is%3Aissue+user%3Asilklabs+milestone%3AFeature2+is%3Aclosed)
Feature3           |Feb 8  |Feb 19 | [Open](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3AFeature3) / [Closed](https://github.com/issues?q=is%3Aissue+user%3Asilklabs+milestone%3AFeature3+is%3Aclosed)
Feature4           |Feb 22 |Mar 4  | [Open](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3AFeature4) / [Closed](https://github.com/issues?q=is%3Aissue+user%3Asilklabs+milestone%3AFeature4+is%3Aclosed)
Feature5           |Mar 7  |Mar 18 | [Open](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3AFeature5) / [Closed](https://github.com/issues?q=is%3Aissue+user%3Asilklabs+milestone%3AFeature5+is%3Aclosed)
Feature6           |Mar 21 |Apr 1  | [Open](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3AFeature6) / [Closed](https://github.com/issues?q=is%3Aissue+user%3Asilklabs+milestone%3AFeature6+is%3Aclosed)
Backlog            |-      |-      | [Open](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3ABacklog)

### Glossary

* **Release (CC)** - all blocking issues resolved, projects labeled, final binaries uploaded, setup documented.  The *release* branch is created upon the completion of CC.
* **Feature mid-week landing (FML)** - all features landed, bug fixing only beyond this point. The *next* branch is created upon the completion of FML.  The next milestone implicitly starts on the *master* branch after FML.

## Issue Tracking

[silk-core](https://github.com/silklabs/silk-core/milestones) milestones.

Issues that should be resolved for Kickstarter but not yet assigned to a specific milestone
are collected in the
[Backlog](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3ABacklog)
bucket.

Issues that don't need to be resolved for Kickstarter, but we want to consider for later,
are collected in the [Post Kickstarter](https://github.com/issues?q=is%3Aopen+is%3Aissue+user%3Asilklabs+milestone%3APost%20Kickstarter)
bucket.

* If you are working on an issue or plan to work on an issue soon, please assign it to yourself.
* Provide regular updates on progress or blockers in your assigned issues every 1-3 days at least.
* Unassigned issues are available for anybody to pick up, and if you see somebody who appears to be overloaded please proactively offer assistance if you have bandwidth.
* Please feel free to help assign the appropriate priority label for an issue, and file new issues as appropriate.
* [Issues without a milestone](https://github.com/issues?utf8=%E2%9C%93&q=is%3Aissue+user%3Asilklabs+is%3Aopen+no%3Amilestone) -- all issues should be assigned to a milestone.

## Branching

<img align="right" src="https://github.com/mvines/releng/raw/master/Branching Diagram.png"/>

All our projects use the same branch names:
* **master** - always open for new development
* **release** - where releases are merged to from `next` or `chemspill`
* **next** - stabilization branch for the current milestone
* **chemspill** - used to resolve critical bugs in release that can't wait for
  the next milestone release

Branching procedures are documented [here](Procedures.md).

### Master branch:
* Default location for merging commits, including fixes for `next` or
  `chemspill` that also affect `master`.

### Next branch:
* The `next` branch is created at Feature Midweek Landing from the current HEAD of
  the `master` branch.
* It is generally assumed that all changes to `next` are applicable to the
  `master` branch, and should merge on the `master` branch first.  Adding the **next+**
  on a PR to `master` will cause it to be uplifted to `next` upon merging.
  Automation will attempt the uplift and notify the PR owner on a merge conflict
  with details on how to manually resolve.
* `next`-only commits are also possible, send the PR to the `next` branch
  instead of `master`.  Note that this should only be done if the fix is not
  relevant to `master`.

### Release branch:
* Updated at the end of milestone by the Release Engineer.
* Each commit represents a new release
* Developers do not merge commits directly in this branch

### ChemSpill branch:
* Created by branching from the HEAD of the release branch.
* Just like `next`, fixes for chemspill should first merge to `master` if
  applicable.
* `chemspill` uplifts from `master` are currently manual, also be sure to uplift
  the fix to `next` as well (also currently manual).

## Branch Comparison Tools

#### *next* commits not in *master*

[silk-core](https://github.com/silklabs/silk-core/compare/master...next)

#### *master* commits not in *next*

[silk-core](https://github.com/silklabs/silk-core/compare/next...master)


## Appendix
### Automation
For details on Releng automation, please refer to [Automation.md](Automation.md).
### Procedures
For details on Releng release procedures, please refer to [Procedures.md](Procedures.md).
