if(NOT DEFINED INFERNUX_SOURCE_DIR OR INFERNUX_SOURCE_DIR STREQUAL "")
    message(FATAL_ERROR "INFERNUX_SOURCE_DIR is required")
endif()

if(NOT DEFINED INFERNUX_WHEEL_DIR OR INFERNUX_WHEEL_DIR STREQUAL "")
    message(FATAL_ERROR "INFERNUX_WHEEL_DIR is required")
endif()

file(GLOB _wheels "${INFERNUX_WHEEL_DIR}/*.whl")
list(LENGTH _wheels _wheel_count)
if(NOT _wheel_count EQUAL 1)
    message(FATAL_ERROR "Expected exactly one wheel in ${INFERNUX_WHEEL_DIR}, found ${_wheel_count}")
endif()
list(GET _wheels 0 _wheel)

set(_package_root "${INFERNUX_SOURCE_DIR}/python")
set(_verify_root "${INFERNUX_WHEEL_DIR}/verify-native-payload")
file(REMOVE_RECURSE "${_verify_root}")
file(MAKE_DIRECTORY "${_verify_root}")
file(ARCHIVE_EXTRACT INPUT "${_wheel}" DESTINATION "${_verify_root}")

file(GLOB_RECURSE _native_files LIST_DIRECTORIES false
    "${_package_root}/Infernux/*.dll"
    "${_package_root}/Infernux/*.dylib"
    "${_package_root}/Infernux/*.pyd"
    "${_package_root}/Infernux/*.so"
)

if(NOT _native_files)
    message(FATAL_ERROR "No native package files found below ${_package_root}/Infernux")
endif()

foreach(_source_file IN LISTS _native_files)
    file(RELATIVE_PATH _relative_path "${_package_root}" "${_source_file}")
    set(_wheel_file "${_verify_root}/${_relative_path}")
    if(NOT EXISTS "${_wheel_file}")
        message(FATAL_ERROR "Wheel is missing native package file: ${_relative_path}")
    endif()

    file(SHA256 "${_source_file}" _source_hash)
    file(SHA256 "${_wheel_file}" _wheel_hash)
    if(NOT _source_hash STREQUAL _wheel_hash)
        message(FATAL_ERROR
            "Wheel contains a stale native package file: ${_relative_path}\n"
            "  current: ${_source_hash}\n"
            "  wheel:   ${_wheel_hash}"
        )
    endif()
endforeach()

file(REMOVE_RECURSE "${_verify_root}")
message(STATUS "Verified native payload for ${_wheel}")
