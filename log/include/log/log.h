#pragma once

#include <android/log.h>

#ifndef LOG_TAG
#define LOG_TAG "unknown"
#endif

#ifndef LOG_NDEBUG
#ifdef NDEBUG
#define LOG_NDEBUG 1
#else
#define LOG_NDEBUG 0
#endif
#endif

#define ALOGF(fmt, args...) \
  __android_log_print(ANDROID_LOG_FATAL, LOG_TAG, fmt, ##args)

#define ALOGE(fmt, args...) \
  __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, fmt, ##args)

#define ALOGW(fmt, args...) \
  __android_log_print(ANDROID_LOG_WARN, LOG_TAG, fmt, ##args)

#define ALOGI(fmt, args...) \
  __android_log_print(ANDROID_LOG_INFO, LOG_TAG, fmt, ##args)

#define ALOGD(fmt, args...) \
  __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, fmt, ##args)

#if LOG_NDEBUG == 0
#define ALOGV(fmt, args...) \
  __android_log_print(ANDROID_LOG_VERBOSE, LOG_TAG, fmt, ##args)
#else
#define ALOGV(fmt, args...) do {} while (0);
#endif
