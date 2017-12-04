#!/bin/bash
source ~/.bash_profile

cd

# Run sshd
/usr/sbin/sshd

eval `ssh-agent -s`

echo "exec cat" > /root/ap-cat.sh

chmod a+x /root/ap-cat.sh

export DISPLAY=1

echo $1 | SSH_ASKPASS=/root/ap-cat.sh ssh-add ~/.ssh/id_rsa

rm /root/ap-cat.sh

#( sleep 4 && while [ 1 ]; do sleep 1; echo $1; done ) | ssh-add ~/.ssh/id_rsa

if [ ! -d "/root/spotinstance_poc" ]; then
  	git clone git@github.com:vidyaAccel/spotinstance_poc.git
fi

cd spotinstance_poc/spotInstancePoc/testAgent/

git pull