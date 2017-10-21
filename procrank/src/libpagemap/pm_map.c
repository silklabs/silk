/*
 * Copyright (C) 2008 The Android Open Source Project
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

#include <stdlib.h>
#include <string.h>

#include <pagemap/pagemap.h>

int pm_map_pagemap(pm_map_t *map, uint64_t **pagemap_out, size_t *len) {
    if (!map)
        return -1;

    return pm_process_pagemap_range(map->proc, map->start, map->end,
                                    pagemap_out, len);
}

int pm_map_usage_flags(pm_map_t *map, pm_memusage_t *usage_out,
                        uint64_t flags_mask, uint64_t required_flags) {
    uint64_t *pagemap;
    size_t len, i;
    uint64_t count;
    pm_memusage_t usage;
    int error;

    if (!map || !usage_out)
        return -1;

    error = pm_map_pagemap(map, &pagemap, &len);
    if (error) return error;

    pm_memusage_zero(&usage);

    for (i = 0; i < len; i++) {
        usage.vss += map->proc->ker->pagesize;

        if (!PM_PAGEMAP_PRESENT(pagemap[i]))
            continue;

        if (!PM_PAGEMAP_SWAPPED(pagemap[i])) {
            if (flags_mask) {
                uint64_t flags;
                error = pm_kernel_flags(map->proc->ker, PM_PAGEMAP_PFN(pagemap[i]),
                                        &flags);
                if (error) goto out;

                if ((flags & flags_mask) != required_flags)
                    continue;
            }

            error = pm_kernel_count(map->proc->ker, PM_PAGEMAP_PFN(pagemap[i]),
                                    &count);
            if (error) goto out;

            usage.rss += (count >= 1) ? map->proc->ker->pagesize : (0);
            usage.pss += (count >= 1) ? (map->proc->ker->pagesize / count) : (0);
            usage.uss += (count == 1) ? (map->proc->ker->pagesize) : (0);
        } else {
            usage.swap += map->proc->ker->pagesize;
        }
    }

    memcpy(usage_out, &usage, sizeof(usage));

    error = 0;

out:    
    free(pagemap);

    return error;
}

int pm_map_usage(pm_map_t *map, pm_memusage_t *usage_out) {
    return pm_map_usage_flags(map, usage_out, 0, 0);
}

int pm_map_workingset(pm_map_t *map, pm_memusage_t *ws_out) {
    uint64_t *pagemap;
    size_t len, i;
    uint64_t count, flags;
    pm_memusage_t ws;
    int error;

    if (!map || !ws_out)
        return -1;

    error = pm_map_pagemap(map, &pagemap, &len);
    if (error) return error;

    pm_memusage_zero(&ws);
    
    for (i = 0; i < len; i++) {
        error = pm_kernel_flags(map->proc->ker, PM_PAGEMAP_PFN(pagemap[i]),
                                &flags);
        if (error) goto out;

        if (!(flags & PM_PAGE_REFERENCED)) 
            continue;

        error = pm_kernel_count(map->proc->ker, PM_PAGEMAP_PFN(pagemap[i]),
                                &count);
        if (error) goto out;

        ws.vss += map->proc->ker->pagesize;
        if( PM_PAGEMAP_SWAPPED(pagemap[i]) ) continue;
        ws.rss += (count >= 1) ? (map->proc->ker->pagesize) : (0);
        ws.pss += (count >= 1) ? (map->proc->ker->pagesize / count) : (0);
        ws.uss += (count == 1) ? (map->proc->ker->pagesize) : (0);
    }

    memcpy(ws_out, &ws, sizeof(ws));

    error = 0;

out:
    free(pagemap);

    return 0;
}

int pm_map_destroy(pm_map_t *map) {
    if (!map)
        return -1;

    free(map->name);
    free(map);

    return 0;
}
