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

#include <pagemap/pagemap.h>

void pm_memusage_zero(pm_memusage_t *mu) {
    mu->vss = mu->rss = mu->pss = mu->uss = mu->swap = 0;
}

void pm_memusage_add(pm_memusage_t *a, pm_memusage_t *b) {
    a->vss += b->vss;
    a->rss += b->rss;
    a->pss += b->pss;
    a->uss += b->uss;
    a->swap += b->swap;
}
