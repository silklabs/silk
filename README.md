
We run two and a half week sprints, with the stabilization period of the
previous sprint overlapping with the start of the next by 3 days.  At the conclusion of
every sprint a release is made to complete that milestone.

Quick "chemspill" branches may also occur on demand to resolve critical issues
with the current release, and run completely independent to the normal sprint cadence.

## Glossary

* **Code complete (CC)** - all blocking issues resolved, projects labeled, final binaries uploaded, setup documented.  The *release* branch is created upon the completion of CC.
* **Feature complete (FC)** - all new features tested and operating as expected.
* **Feature mid-week landing (FML)** - all features landed, bug fixing only beyond this point. The *next* branch is created upon the completion of FML.
* **Start** - GH issues raised for major feature work targeted for this sprint and owners assigned

## Fall Release Calendar

Milestone Name      |Start  |FML    |FC     |CC
--------------------|-------|-------|-------|-------
Adventus8           |Aug 31 |Sept 9 |Sept 11|Sept 17
Adventus7           |Sept 14|Sept 23|Sept 25|Oct 1
Adventus6           |Sept 28|Oct 7  |Oct 9  |Oct 15
Adventus5           |Oct 12 |Oct 21 |Oct 23 |Oct 29
Adventus4           |Oct 26 |Nov 4  |Nov 6  |Nov 12
Adventus3           |Nov 9  |Nov 18 |Nov 20 |Nov 26
Adventus2           |Nov 23 |Dec 2  |Dec 4  |Dec 10
Adventus1           |Dec 7  |Dec 11 |Dec 15 |Dec 18
*Happy Holidays!!!* |Dec 21 |-      |-      |Jan 1

## Issue Tracking

Github milestones are created in all the affected projects to collect issues:

[silk-app](https://github.com/silklabs/silk-app/milestones)
| [silk-device](https://github.com/silklabs/silk-device/milestones)
| [silk-server](https://github.com/silklabs/silk-server/milestones)

* If you are working on an issue or plan to work on an issue soon, please assign it to yourself.
* Provide regular updates on progress or blockers in your assigned issues every 1-3 days at least.
* Unassigned issues are available for anybody to pick up, and if you see somebody who appears to be overloaded please proactively offer assistance if you have bandwidth.
* Please feel free to help assign the appropriate priority label for an issue, and file new issues as appropriate.

## Branching Details

<img align="right" src="https://github.com/mvines/releng/raw/master/Branching Diagram.png"/>

All our projects use the same branch names:
* **master** - always open for new development
* **release** - where releases are merged to from next or chemspill.
* **next** - stabilization branch for the current milestone
* **chemspill** - used to resolve critical bugs in release that can't wait for the next milestone

### Master branch:
* Default location for merging commits
* It is not necessary to double-land next or chemspill commits on both the next/chemspill branch and master, but doing so is no problem.  For example if you want to let your commit rest on master for a time.  However it is always necessary to land your fix in the next/chemspill branch if it is applicable to the branch (ie, we have no integration team for commit propagation yet).

### Next branch:
* The next branch is created at Feature Midweek Landing from the current HEAD of the master branch.
* Generally assumed that all changes should be applicable to the master branch (ie, reverts of changes on master require special attention, see "Special Case" section below)
* Upon completion of the milestone goals, the next branch is:
 1. Copied into the release branch
 2. Merged back into the master branch
 3. Deleted until the next  Feature Midweek Landing (to avoid confusion)

### Release branch:
* Updated at the end of milestone by the Release Engineer.
* Each commit represents a new release
* Developers do not merge commits directly in this branch

### ChemSpill branch:
* Created by branching from the HEAD of the release branch.
* Upon completion of the milestone goals, the chemspill branch is:
 1. Merged into the release branch
 2. Merged into the master branch
 3. Merged into the milestone branch, if one exists at that time.
 4. Deleted


#### Special Case: Managing Reverts on a Next or ChemSpill Branch

If a commit from master is reverted, or some other changes made that is only for
the next branch then special handling is required.  If the following steps are
not taken then that change will propagate back to the master branch undesirably
once the current milestone completes.

1. Before making the change on the next branch that is not applicable to master,
ensure that all existing changes on the next branch have been merged back to the
master branch by running `git checkout master && git merge next`

2. Commit the change to the next branch that should not be propagated back to master.

3. Once again perform a merge back to master however this time instruct git to
ignore the new commit: `git checkout master && git merge next -s ours`

4. Resume normal workflow.

It is currently expected that this will be a rare occurrence, as the next branch
should be created as late as possible such that they only contain minor bug
fixes as a result of stabilization.

## Branch Comparison Tools

#### *next* commits not in *master*

These links display the commits that need to be merged back to *master* before
finishing the release.

[silk-app](https://github.com/silklabs/silk-app/compare/master...next)
| [silk-device](https://github.com/silklabs/silk-device/compare/master...next)
| [silk-server](https://github.com/silklabs/silk-server/compare/master...next)

If no merge conflicts exist a github PR may be created directly from these
links.  If merge conflicts do exist, manual resolution is required on the
commandline by (1) cloning the project, and (2) running `git merge next` while on
the *master* branch then resolving any conflicts, and finally (3) sending a normal PR
back to *master*.

#### *master* commits not in *next*

These links display the commits on *master* that are not in the current *next*
branch.  Some of these commits may need to be manually cherry picked into *next*
if they resolve issues targeted for the next release.

[silk-app](https://github.com/silklabs/silk-app/compare/next...master)
| [silk-device](https://github.com/silklabs/silk-device/compare/next...master)
| [silk-server](https://github.com/silklabs/silk-server/compare/next...master)

##  Release Engineering Tools

* `./fml.sh` - Prepares the *next* branch to begin stabilizating for release.
* `./release.sh` - Finishes the current release.


