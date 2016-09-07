
# Turn off unneeded platform features
SILK_FEATURE_SVM_AUDIOANALYTICS := false
SILK_FEATURE_DEMOS := false
SILK_FEATURE_DIALOG := true
SILK_FEATURE_QDN := false
SILK_FEATURE_UI_MOVIES := false
SILK_FEATURE_VIDEOANALYTICS := false

include product/silk/silk.mk
