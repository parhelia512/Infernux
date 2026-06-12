# Remove stale _Infernux native modules from python/Infernux/lib.
#
# A wheel built from a lib dir that still contains a module from a DIFFERENT
# Python ABI (e.g. _Infernux.cp313-win_amd64.pyd next to the fresh cp312 one)
# ships both files to users (GitHub issue #47). This script runs POST_BUILD,
# right before the fresh module is copied, and deletes every _Infernux.*
# module except the one that was just built.
#
# Required variables:
#   TARGET_DIR  — python/Infernux/lib
#   KEEP_NAME   — file name of the freshly built module (e.g. _Infernux.cp312-win_amd64.pyd)

if(NOT DEFINED TARGET_DIR OR NOT DEFINED KEEP_NAME)
    message(FATAL_ERROR "clean_stale_native_modules.cmake requires TARGET_DIR and KEEP_NAME")
endif()

file(GLOB _stale_modules
    "${TARGET_DIR}/_Infernux.*.pyd"
    "${TARGET_DIR}/_Infernux.*.so"
    "${TARGET_DIR}/_Infernux.pyd"
    "${TARGET_DIR}/_Infernux.so"
)

foreach(_mod ${_stale_modules})
    get_filename_component(_name "${_mod}" NAME)
    if(NOT _name STREQUAL "${KEEP_NAME}")
        file(REMOVE "${_mod}")
        message(STATUS "Removed stale native module: ${_name} (keeping ${KEEP_NAME})")
    endif()
endforeach()
