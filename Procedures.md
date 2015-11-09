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
