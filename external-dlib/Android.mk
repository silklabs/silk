LOCAL_PATH := $(call my-dir)

_ := $(shell cd $(LOCAL_PATH) && npm run dlib)

$(LOCAL_PATH)/shape_predictor_68_face_landmarks.dat:
	@echo Downloading: $@
	cd $(@D) && npm run shape_predictor_68_face_landmarks

