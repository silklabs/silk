#!/bin/sh
URL_BASE="http://silk-dev-models.s3-website-us-west-1.amazonaws.com/"
MODELS="tiny-yolo tiny-coco"
FILENAMES=""
for MODEL in ${MODELS}; do
    BASENAME="models/${MODEL}"
    SHA_FILE="${BASENAME}.sha"
    WEIGHTS_FILE="${BASENAME}.weights"
    SHA="$(cut -d ' ' -f 1 ${SHA_FILE})"
    URL="${URL_BASE}${MODEL}.weights-${SHA}"
    shasum -c ${SHA_FILE} || (rm -f ${WEIGHTS_FILE} && curl -o ${WEIGHTS_FILE} --url ${URL})
done
