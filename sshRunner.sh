#!/bin/bash
source ~/.bash_profile

cd

# Run sshd
/usr/sbin/sshd

eval `ssh-agent -s`

( sleep 4 && while [ 1 ]; do sleep 1; echo $1; done ) | ssh-add ~/.ssh/id_rsa

if [ ! -d "/root/spotinstance_poc" ]; then
  	git clone git@github.com:vidyaAccel/spotinstance_poc.git
fi

cd spotinstance_poc/testAgent/

git pull