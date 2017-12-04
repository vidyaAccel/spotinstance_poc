#!/bin/bash
source ~/.bash_profile

cd

# Run sshd
/usr/sbin/sshd

eval `ssh-agent -s`

( sleep 4 && while [ 1 ]; do sleep 1; echo $1; done ) | ssh-add ~/.ssh/id_rsa

git clone git@github.com:vidyaAccel/spotinstance_poc.git

cd spotinstance_poc/

git pull