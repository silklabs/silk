/*
 * Copyright (C) 2015 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#define EX_OK 0           /* \o/ */
#define EX_SOFTWARE 70    /* internal software error */
#define EX_UNAVAILABLE 69 /* service unavailable */
#define EX_USAGE 64       /* command line usage error */

#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <hardware/hardware.h>
#include <hardware/boot_control.h>

static void usage(FILE* where, int argc, char* argv[])
{
    (void) argc;
    fprintf(where,
            "%s - command-line wrapper for the boot_control HAL.\n"
            "\n"
            "Usage:\n"
            "  %s COMMAND\n"
            "\n"
            "Commands:\n"
            "  %s hal-info                       - Show info about boot_control HAL used.\n"
            "  %s get-number-slots               - Prints number of slots.\n"
            "  %s get-current-slot               - Prints currently running SLOT.\n"
            "  %s mark-boot-successful           - Mark current slot as GOOD.\n"
            "  %s set-active-boot-slot SLOT      - On next boot, load and execute SLOT.\n"
            "  %s set-slot-as-unbootable SLOT    - Mark SLOT as invalid.\n"
            "  %s is-slot-bootable SLOT          - Returns 0 only if SLOT is bootable.\n"
            "  %s is-slot-marked-successful SLOT - Returns 0 only if SLOT is marked GOOD.\n"
            "  %s get-suffix SLOT                - Prints suffix for SLOT.\n"
            "\n"
            "SLOT parameter is the zero-based slot-number.\n",
            argv[0], argv[0], argv[0], argv[0], argv[0], argv[0],
            argv[0], argv[0], argv[0], argv[0], argv[0]);
}

static int do_hal_info(const hw_module_t *hw_module)
{
    fprintf(stdout,
            "HAL name:            %s\n"
            "HAL author:          %s\n"
            "HAL module version:  %d.%d\n",
            hw_module->name,
            hw_module->author,
            hw_module->module_api_version>>8,
            hw_module->module_api_version&0xff);
    return EX_OK;
}

static int do_get_number_slots(boot_control_module_t *module)
{
    int num_slots = module->getNumberSlots(module);
    fprintf(stdout, "%d\n", num_slots);
    return EX_OK;
}

static int do_get_current_slot(boot_control_module_t *module)
{
    int cur_slot = module->getCurrentSlot(module);
    fprintf(stdout, "%d\n", cur_slot);
    return EX_OK;
}

static int do_mark_boot_successful(boot_control_module_t *module)
{
    int ret = module->markBootSuccessful(module);
    if (ret == 0)
        return EX_OK;
    fprintf(stderr, "Error marking as having booted successfully: %s\n",
            strerror(-ret));
    return EX_SOFTWARE;
}

static int do_set_active_boot_slot(boot_control_module_t *module,
                                   int slot_number)
{
    int ret = module->setActiveBootSlot(module, slot_number);
    if (ret == 0)
        return EX_OK;
    fprintf(stderr, "Error setting active boot slot: %s\n", strerror(-ret));
    return EX_SOFTWARE;
}

static int do_set_slot_as_unbootable(boot_control_module_t *module,
                                     int slot_number)
{
    int ret = module->setSlotAsUnbootable(module, slot_number);
    if (ret == 0)
        return EX_OK;
    fprintf(stderr, "Error setting slot as unbootable: %s\n", strerror(-ret));
    return EX_SOFTWARE;
}


static int do_is_slot_bootable(boot_control_module_t *module, int slot_number)
{
    int ret = module->isSlotBootable(module, slot_number);
    if (ret == 0) {
        return EX_SOFTWARE;
    } else if (ret < 0) {
        fprintf(stderr, "Error calling isSlotBootable(): %s\n",
                strerror(-ret));
        return EX_SOFTWARE;
    }
    return EX_OK;
}


static int do_get_suffix(boot_control_module_t *module, int slot_number)
{
    const char* suffix = module->getSuffix(module, slot_number);
    fprintf(stdout, "%s\n", suffix);
    return EX_OK;
}

static int do_is_slot_marked_successful(boot_control_module_t *module,
                                        int slot_number)
{
    if (module->isSlotMarkedSuccessful == NULL) {
        fprintf(stderr, "isSlotMarkedSuccessful() is not implemented by HAL.\n");
        return EX_UNAVAILABLE;
    }
    int ret = module->isSlotMarkedSuccessful(module, slot_number);
    if (ret == 0) {
        return EX_SOFTWARE;
    } else if (ret < 0) {
        fprintf(stderr, "Error calling isSlotMarkedSuccessful(): %s\n",
                strerror(-ret));
        return EX_SOFTWARE;
    }
    return EX_OK;
}

static int parse_slot(int pos, int argc, char *argv[])
{
    if (pos > argc - 1) {
        usage(stderr, argc, argv);
        exit(EX_USAGE);
        return -1;
    }
    errno = 0;
    long int ret = strtol(argv[pos], NULL, 10);
    if (errno != 0 || ret > INT_MAX || ret < 0) {
        usage(stderr, argc, argv);
        exit(EX_USAGE);
        return -1;
    }
    return (int)ret;
}

int main(int argc, char *argv[])
{
    const hw_module_t *hw_module;
    boot_control_module_t *module;
    int ret;

    if (argc < 2) {
        usage(stderr, argc, argv);
        return EX_USAGE;
    }

    ret = hw_get_module("bootctrl", &hw_module);
    if (ret != 0) {
        fprintf(stderr, "Error getting bootctrl module.\n");
        return EX_SOFTWARE;
    }
    module = (boot_control_module_t*) hw_module;
    module->init(module);

    if (strcmp(argv[1], "hal-info") == 0) {
        return do_hal_info(hw_module);
    } else if (strcmp(argv[1], "get-number-slots") == 0) {
        return do_get_number_slots(module);
    } else if (strcmp(argv[1], "get-current-slot") == 0) {
        return do_get_current_slot(module);
    } else if (strcmp(argv[1], "mark-boot-successful") == 0) {
        return do_mark_boot_successful(module);
    } else if (strcmp(argv[1], "set-active-boot-slot") == 0) {
        return do_set_active_boot_slot(module, parse_slot(2, argc, argv));
    } else if (strcmp(argv[1], "set-slot-as-unbootable") == 0) {
        return do_set_slot_as_unbootable(module, parse_slot(2, argc, argv));
    } else if (strcmp(argv[1], "is-slot-bootable") == 0) {
        return do_is_slot_bootable(module, parse_slot(2, argc, argv));
    } else if (strcmp(argv[1], "get-suffix") == 0) {
        return do_get_suffix(module, parse_slot(2, argc, argv));
    } else if (strcmp(argv[1], "is-slot-marked-successful") == 0) {
        return do_is_slot_marked_successful(module, parse_slot(2, argc, argv));
    } else {
        usage(stderr, argc, argv);
        return EX_USAGE;
    }

    return 0;
}
