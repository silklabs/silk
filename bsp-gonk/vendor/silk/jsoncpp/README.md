## How to update and use [jsoncpp](https://github.com/open-source-parsers/jsoncpp)
File in this project are auto-generated. To update the files from the latest jsoncpp git project, please follow the instructions below.

### Clone git repository
    mkdir -p jsoncpp_original
    cd jsoncpp_original
    git clone git@github.com:open-source-parsers/jsoncpp.git

### Run amalagamate.py
    cd jsoncpp_original/jsoncpp
    python amalgamate.py -s ../../jsoncpp/jsoncpp.cpp -i json/json.h

### Add the following lines to the makefile of the project that is using jsconcpp
    LOCAL_CFLAGS += -DJSON_USE_EXCEPTION=0
    LOCAL_SRC_FILES := <PATH-TO-jsoncpp>/jsoncpp.cpp
    LOCAL_C_INCLUDES += <PATH-TO-jsoncpp>
    include external/stlport/libstlport.mk

## References
* [Why amalgamate](https://github.com/open-source-parsers/jsoncpp#using-jsoncpp-in-your-project)