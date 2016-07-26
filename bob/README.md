# Bob the Builder

Cheesy facility to run arbitrary commands on arbitrary hosts from within a
Travis job.  This can be used in a pinch to:

1. Support builds that are too large for Travis
2. Support specialized builds, such as GPU training, that require dedicated hardware

Bob is very simple.  No attempt is made to deal with limiting concurrent builds.

## Build Host Setup

1. Create an account on the machine for the `stooge` user
2. Ensure the stooge user has the right SSH key
3. `mkdir ~/bob` as the stooge user
4. Install whatever dependencies are required for the builds that will be running on this host.

