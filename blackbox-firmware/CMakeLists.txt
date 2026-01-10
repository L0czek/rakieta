cmake_minimum_required(VERSION 3.22)

#
# This file is generated only once,
# and is not re-generated if converter is called multiple times.
#
# User is free to modify the file as much as necessary
#


# Setup compiler settings
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

set(CMAKE_CXX_STANDARD 23)


# Define the build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE "Release")
endif()

# Set the project name
set(CMAKE_PROJECT_NAME blackbox-firmware)

# Enable compile command to ease indexing with e.g. clangd
set(CMAKE_EXPORT_COMPILE_COMMANDS TRUE)

# Core project settings
project(${CMAKE_PROJECT_NAME})
message("Build type: " ${CMAKE_BUILD_TYPE})

# Enable CMake support for ASM and C languages
enable_language(C CXX ASM)

# Create an executable object type
add_executable(${CMAKE_PROJECT_NAME})

# Add STM32CubeMX generated sources
add_subdirectory(cmake/stm32cubemx)

# SD card library
add_subdirectory(lib/stm32-spi-dma-sdcard)

# Link directories setup
target_link_directories(${CMAKE_PROJECT_NAME} PRIVATE
    # Add user defined library search paths
)

# Add sources to executable
target_sources(${CMAKE_PROJECT_NAME} PRIVATE
    # Add user sources here
    ./Core/Src/logging.c
)

# Add include paths
target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE
    # Add user defined include paths
)

# Add project symbols (macros)
target_compile_definitions(${CMAKE_PROJECT_NAME} PRIVATE
    # Add user defined symbols
)

# Remove wrong libob.a library dependency when using cpp files
list(REMOVE_ITEM CMAKE_C_IMPLICIT_LINK_LIBRARIES ob)

# Add linked libraries
target_link_libraries(${CMAKE_PROJECT_NAME}
    stm32cubemx
    stm32-spi-dma-sdcard

    # Add user defined libraries
    rdimon
)

set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -specs=rdimon.specs")
add_compile_definitions(${CMAKE_PROJECT_NAME} "__USE_SEMIHOSTING__")

# =============================================================================
# Test target for SD card library (with semihosting)
# =============================================================================
set(TEST_TARGET sdcard-test)

add_executable(${TEST_TARGET})

# Add test sources
target_sources(${TEST_TARGET} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/sdcard/test_main.c
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/sdcard/test_it.c
    ${CMAKE_CURRENT_SOURCE_DIR}/Core/Src/stm32c0xx_hal_msp.c
    ${CMAKE_CURRENT_SOURCE_DIR}/Core/Src/sysmem.c
    ${CMAKE_CURRENT_SOURCE_DIR}/Core/Src/syscalls.c
    ${CMAKE_CURRENT_SOURCE_DIR}/startup_stm32c011xx.s
)

# Link libraries
target_link_libraries(${TEST_TARGET}
    stm32cubemx
    STM32_Drivers
    stm32-spi-dma-sdcard
    rdimon
)

# Semihosting support (rdimon.specs already in global linker flags)
target_compile_definitions(${TEST_TARGET} PRIVATE __USE_SEMIHOSTING__)
