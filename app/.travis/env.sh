#
# Setup the Travis environment.
#
# |source| this file
#

export  PROJECT=Silk
export  CONFIGURATION=Release
# Single quotes needed so that YAML doesn't escape the colon
export  'DEVELOPER_NAME="iPhone Developer: Silk Stooge (DPVPFYSNHB)"'
# These values are all related and could even be extracted from the .mobileprovision file:
# http://stackoverflow.com/questions/21860632/archive-distribute-ios-app-to-app-store-via-command-line
export  PROFILE_NAME="CI Build Profile"
export  PROFILE_FILE_NAME="CI_Build_Profile.mobileprovision"
export  PROFILE_UUID="d6f599df-2a83-40fa-89c3-fd40df2f3bc4"
