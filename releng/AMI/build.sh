#!/bin/bash

aws_access_key_id=$(node -p "require('../../credentials/aws/ec2_manager.json').AWS_ACCESS_KEY_ID")
aws_secret_access_key=$(node -p "require('../../credentials/aws/ec2_manager.json').AWS_SECRET_ACCESS_KEY")

packer build \
    -var "aws_access_key=$aws_access_key_id" \
    -var "aws_secret_key=$aws_secret_access_key" \
    template.json
