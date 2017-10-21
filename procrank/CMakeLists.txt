cmake_minimum_required (VERSION 3.1)

project (aosp-procrank)
add_definitions(-D_LARGEFILE64_SOURCE -D_GNU_SOURCE)
include_directories(src/libpagemap/include)
add_executable(
  procrank
  src/procrank/procrank.c
  src/libpagemap/pm_kernel.c
  src/libpagemap/pm_process.c
  src/libpagemap/pm_map.c
  src/libpagemap/pm_memusage.c
)

install(TARGETS procrank DESTINATION bin)
