#
# Set up environment variables for the CI provisioning profile.
#
# |source| this file.
#

export DEVELOPER_NAME="iPhone Developer: Silk Stooge (DPVPFYSNHB)"
# These values are all related and could even be extracted from the .mobileprovision file:
# http://stackoverflow.com/questions/21860632/archive-distribute-ios-app-to-app-store-via-command-line
export PROFILE_NAME="CI Build Profile"
export PROFILE_FILE_NAME="CI_Build_Profile.mobileprovision"
export PROFILE_UUID="0207a665-9bc6-4d58-b2ee-f665e13785e7"
