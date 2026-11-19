# fw_build.cmake — dùng chung cho 3 firmware ESP-IDF: esp32_cam, esp32_s3_firmware_node,
# gateway ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting.
#
# Trong CMakeLists.txt của project, SAU project():
#     include(<đường dẫn tới>/firmware/cmake/fw_build.cmake)
#     fw_optimize_size()   # biên dịch toàn bộ app với -Os
#     fw_size_report()     # in bảng tài nguyên (Flash, DIRAM/DRAM, IRAM, RTC) mỗi lần idf.py build / flash
#
# Tắt khi build (lưu trong CMakeCache, bật lại bằng =ON):
#     idf.py -DFW_OPT_SIZE=OFF build      dùng mức tối ưu đang chọn trong menuconfig (vd. -Og để debug GDB)
#     idf.py -DFW_SIZE_REPORT=OFF build   không in bảng (idf.py size vẫn dùng được)
# Cách đọc bảng: docs/guides/ESP_IDF_BUILD.md §5.

option(FW_OPT_SIZE "Compile the whole app with -Os even if sdkconfig selects another optimization level" ON)
option(FW_SIZE_REPORT "Print the memory usage summary (esp_idf_size) on every build and before flashing" ON)

# Mọi target do CMake build trong cây thư mục `dir` (component, thư viện con như mbedcrypto, file .elf).
function(_fw_collect_targets dir out)
    get_property(targets DIRECTORY "${dir}" PROPERTY BUILDSYSTEM_TARGETS)
    get_property(subdirs DIRECTORY "${dir}" PROPERTY SUBDIRECTORIES)
    foreach(sub ${subdirs})
        _fw_collect_targets("${sub}" sub_targets)
        list(APPEND targets ${sub_targets})
    endforeach()
    set(${out} ${targets} PARENT_SCOPE)
endfunction()

# Cách chuẩn của ESP-IDF là Kconfig CONFIG_COMPILER_OPTIMIZATION_SIZE (sdkconfig.defaults của 3 project đã chọn).
# Nhưng sdkconfig.defaults không ghi đè giá trị đã có trong sdkconfig: máy đã build trước đó vẫn giữ -Og.
# Khi đó thêm -Os vào CUỐI cờ biên dịch của mọi target (sau -Og mà ESP-IDF đặt theo sdkconfig) — GCC dùng cờ -O
# xuất hiện sau cùng. Bootloader là project CMake riêng, đã -Os sẵn (CONFIG_BOOTLOADER_COMPILER_OPTIMIZATION_SIZE).
function(fw_optimize_size)
    idf_build_get_config(opt_size CONFIG_COMPILER_OPTIMIZATION_SIZE)
    if(opt_size)
        message(STATUS "Optimization: -Os (sdkconfig CONFIG_COMPILER_OPTIMIZATION_SIZE)")
        return()
    endif()
    if(NOT FW_OPT_SIZE)
        message(STATUS "Optimization: level selected in sdkconfig (FW_OPT_SIZE=OFF)")
        return()
    endif()

    _fw_collect_targets("${CMAKE_SOURCE_DIR}" targets)
    set(count 0)
    foreach(target ${targets})
        get_target_property(type ${target} TYPE)
        if(type MATCHES "^(STATIC_LIBRARY|OBJECT_LIBRARY|SHARED_LIBRARY|MODULE_LIBRARY|EXECUTABLE)$")
            # Cùng cặp cờ ESP-IDF dùng cho CONFIG_COMPILER_OPTIMIZATION_SIZE với GCC ($IDF_PATH/CMakeLists.txt)
            target_compile_options(${target} PRIVATE -Os -freorder-blocks)
            math(EXPR count "${count} + 1")
        endif()
    endforeach()
    message(STATUS "Optimization: -Os forced on ${count} targets (sdkconfig still selects another level - "
                   "sync it: idf.py menuconfig > Compiler options > Optimization Level > Optimize for size)")
endfunction()

# Target luôn chạy (không có OUTPUT): nằm trong ALL nên in bảng mỗi lần idf.py build, kể cả khi không có gì đổi;
# flash / app-flash phụ thuộc vào nó nên idf.py flash in bảng trước khi nạp. Chạy sau khi link .elf (file .map mới).
function(fw_size_report)
    if(NOT FW_SIZE_REPORT)
        return()
    endif()
    idf_build_get_property(elf EXECUTABLE)
    idf_build_get_property(python PYTHON)
    set(mapfile "${CMAKE_BINARY_DIR}/${CMAKE_PROJECT_NAME}.map")
    # ESP_IDF_SIZE_NG=1: bảng mới như `idf.py size` (chạy thẳng esp_idf_size thì ra định dạng cũ)
    add_custom_target(fw_size_table ALL
        COMMAND ${CMAKE_COMMAND} -E env ESP_IDF_SIZE_NG=1 ${python} -m esp_idf_size "${mapfile}"
        COMMENT "Memory usage of ${CMAKE_PROJECT_NAME} (per library: idf.py size-components, per file: idf.py size-files)"
        USES_TERMINAL
        VERBATIM)
    add_dependencies(fw_size_table ${elf})
    foreach(flash_target flash app-flash)
        if(TARGET ${flash_target})
            add_dependencies(${flash_target} fw_size_table)
        endif()
    endforeach()
endfunction()
