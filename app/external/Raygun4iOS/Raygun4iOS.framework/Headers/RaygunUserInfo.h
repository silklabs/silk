//
//  RaygunUserInfo.h
//  Raygun4iOS
//
//  Created by Jason Fauchelle on 16/06/15.
//  Copyright (c) 2015 Mindscape. All rights reserved.
//

#ifndef Raygun4iOS_RaygunUserInfo_h
#define Raygun4iOS_RaygunUserInfo_h

@interface RaygunUserInfo : NSObject

/**
 Unique Identifier for this user. Set this to the identifier you use internally to look up users,
 or a correlation id for anonymous users if you have one. It doesn't have to be unique, but we will
 treat any duplicated values as the same user. If you use the user's email address as the identifier,
 enter it here as well as the email field.
 
 @warning The identifier must be set in order for any of the other fields to be sent.
*/
@property (nonatomic, readwrite, retain) NSString *identifier;

/**
 Flag indicating whether a user is anonymous or not.
 Generally, set this to true if the user is not logged in.
*/
@property (nonatomic, readwrite) BOOL isAnonymous;

/**
 User's email address
*/
@property (nonatomic, readwrite, retain) NSString *email;

/**
 User's full name.
*/
@property (nonatomic, readwrite, retain) NSString *fullName;

/**
 User's first or preferred name.
*/
@property (nonatomic, readwrite, retain) NSString *firstName;

/**
 Creates and returns a RaygunUserInfo object.
 
 @param identifier The unique user identifier that you use internally to look up users.
 
 @return a new RaygunUserInfo object.
 */
- (id)initWithIdentifier:(NSString *)identifier;

/**
 Creates and returns a RaygunUserInfo object.
 
 @param identifier The unique user identifier that you use internally to look up users.
 @param email The user's email address.
 @param fullName The user's full name.
 @param firstName The user's first or preferred name.
 
 @return a new RaygunUserInfo object.
 */
- (id)initWithIdentifier:(NSString *)identifier
               withEmail:(NSString *)email
            withFullName:(NSString *)fullName
           withFirstName:(NSString *)firstName;

/**
 Creates and returns a RaygunUserInfo object.
 
 @param identifier The unique user identifier that you use internally to look up users.
 @param email The user's email address.
 @param fullName The user's full name.
 @param firstName The user's first or preferred name.
 @param isAnonymous True if the user is not logged in, or however you want to define anonymous.
 
 @return a new RaygunUserInfo object.
 */
- (id)initWithIdentifier:(NSString *)identifier
               withEmail:(NSString *)email
            withFullName:(NSString *)fullName
           withFirstName:(NSString *)firstName
         withIsAnonymous:(BOOL) isanonymous;

@end

#endif
