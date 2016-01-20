//
//  VBPlayer.h
//  VBPlayer
//
//  Copyright (c) 2015 Viblast. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <QuartzCore/QuartzCore.h>
#import <AVFoundation/AVFoundation.h>

#import "VBDisplayLayer.h"

#if defined(__cplusplus)
#define VIBLAST_EXPORT extern "C"
#else
#define VIBLAST_EXPORT extern
#endif

/*
 VBPlayerDelegate
 
 All of the methods are sent on the main thread.
 */
@class VBPlayer;

@protocol VBPlayerDelegate <NSObject>

@optional

- (void)playerDidEnterStall:(VBPlayer *)player;
- (void)playerDidExitStall:(VBPlayer *)player;

- (void)playerDidFinishPlaying:(VBPlayer *)player;
@end

/*
 VBPlayer
 
 */
typedef NS_ENUM(NSInteger, VBPlayerStatus) {
  VBPlayerStatusUnknown,
  VBPlayerStatusReadyToPlay,
  VBPlayerStatusFailed
};

@interface VBPlayer : NSObject

// Contains the error when player's status is set to VBPlayerStatusFailed.
@property (nonatomic, readonly) NSError *error;

// Use KVO to observe the status of the player so you know when to call play.
// All status notifications during the playback are serialized on the main queue.
// If the state happens to be VBPlayerStatusFailed you must reinitalize the player.
@property (nonatomic, readonly) VBPlayerStatus status;

// Currently supported values are 0.0 for stopped playback and 1.0 for playing at normal rate.
@property (nonatomic) float rate;

// Can't use KVO
@property (readonly) CMTime duration;

// Use periodic time notifications to poll this property.
@property (readonly) CMTime currentTime;

@property (nonatomic, weak) id<VBPlayerDelegate> delegate;

- (instancetype)initWithCDN:(NSString *)cdn;

// For the available settings check the constants below.
- (instancetype)initWithCDN:(NSString *)cdn settings:(NSDictionary *)settings;

- (instancetype)initWithArgs:(NSString *)args;

- (void)play;
- (void)pause;

// Seek to a given |time| (imprecise).
// Depending on the stream the actual seeked time might not be the same as the requested one
// for efficiency reasons. In order to perform a precised seek see seekToTime:tolerance:.
- (void)seekToTime:(CMTime)time;

// Seek to a given |time| and provide a |tolerance| back in time to restrict the result time that is
// the time seeked to will be in [time - tolerance, time] range.
// Tolerance kCMTimePositiveInfinity will give the same result as seekToTime:.
// Tolerance kCMTimeZero will perform a precise seek.
- (void)seekToTime:(CMTime)time tolerance:(CMTime)tolerance;

// Use a |completion| handler if you want to be notified when the seek operation completes.
- (void)seekToTime:(CMTime)time completion:(void(^)(void))completion;
- (void)seekToTime:(CMTime)time tolerance:(CMTime)tolerance completion:(void(^)(void))completion;


// Observe periodic time changes.
// Must retain the result in order the |block| to be called.
// If |queue| is NULL the updates will be deliverd on the main queue.
// Use |interval| to specify how often the block should be called.
// Inside the observer you can inspect the current time.
// Pair with -removeTimeObserver:.
- (id)addPeriodicTimeObserverForInterval:(CMTime)interval
                                   queue:(dispatch_queue_t)queue
                              usingBlock:(void (^)(void))block;
- (void)removeTimeObserver:(id)observer;

// Set a layer to render the player's output
- (void)setDisplayLayer:(VBDisplayLayer *)layer;

@end



/*
 VBDataPlayer
 
 A subclass of VBPlayer which exposes a buffer-like interface to let you feed the player with media 
 segments. Current supported media coding is only MP4.

 Things to keep in mind:
 * You can manipulate the current time using -seekToTime:. By default it is set to 0.
 * The client should append only continuous data.
 * Calling -seekToTime:. will discard any buffered data so far so it is a client's responsibility
   to cache or acquire the media data again and feed it when appropriate.
 * Calling |duration| on this player will result in kCMTimeIndefinite.
 * You should again (as in VBPlayer) observer the |status| to know when the player is ready to play.
 
 */


/*
 VBDataCoding
 Describes the possible codings of the data you wish to append to the player.
 
 * VBDataCodingMP4 - Use for MP4 data with multiplexed content, e.g. AV initialization (+ AV data),
 * VBDataCodingMP4Audio - Use for MP4 audio only data, e.g. Audio initialization (+ Audio data)
 * VBDataCodingMP4Video - Use for MP4 video only data, e.g. Video initialization (+ Video data)
 
 */
typedef NS_ENUM(NSInteger, VBDataCoding) {
  VBDataCodingMP4,
  VBDataCodingMP4Audio,
  VBDataCodingMP4Video,
};


@interface VBDataPlayer : VBPlayer

// Designated initializer
+ (instancetype)createDataPlayer;

// Enqueues media |data| with certain |coding| to be played at some point ahead of time.
// NOTE: Each |data| MUST be the continuation of the data previously appended! This does NOT hold
// if the append is made after a seek or if this is the first append.
- (BOOL)appendData:(NSData *)data coding:(VBDataCoding)coding error:(NSError **)outError;

// Returns the duration of the data segments haven't been requested for decoding yet.
// This is the minimum between the audio and the video duration.
- (CMTime)bufferedDuration;

// Tells the player that there is no more data to be played and that it should finish when it has
// played its last piece of data.
// NOTE: Whenever -seekToTime: is issued this information is lost and you have to call this method
// again when appropriate.
- (void)endOfStream;
@end

// Constants:
VIBLAST_EXPORT NSString *const VBErrorDomain;

// VBPlayer initialization settings:
VIBLAST_EXPORT NSString *const VBEnablePDNKey; // NSNumber (BOOL)

// VBPlayerDelegate's methods as notifications:
VIBLAST_EXPORT NSString *const VBPlayerDidEnterStallNotification;
VIBLAST_EXPORT NSString *const VBPlayerDidExitStallNotification;
VIBLAST_EXPORT NSString *const VBPlayerDidFinishPlayingNotification;
