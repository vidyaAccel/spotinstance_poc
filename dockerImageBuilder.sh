#!/bin/bash

#buil docker container passing ssh keys and passphrase
docker image build -t spotpoc/poc:ubuntu_androidsdk --build-arg ssh_prv_key="$(cat ~/.ssh/id_rsa)" --build-arg ssh_pub_key="$(cat ~/.ssh/id_rsa.pub)" --build-arg ssh_prv_key_pass=$1 --no-cache -f $2 .