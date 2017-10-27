cmake_minimum_required (VERSION 3.1)
include(CheckIncludeFiles)
project (liblog)

add_library(
  log SHARED
  log.c
)
include_directories(include)
install(TARGETS log DESTINATION lib)
