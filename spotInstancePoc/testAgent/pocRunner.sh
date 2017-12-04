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

if [[ $2 -eq "" ]]; then
	$2="android-21"
fi

echo "ANDROID API: $2"

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 \
    "platforms;$2" "sources;$2" "system-images;$2;google_apis;x86"

sdkmanager --sdk_root=/root/android-sdk/ --channel=0 --update

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --licenses

( sleep 4 && while [ 1 ]; do sleep 1; echo no; done ) | avdmanager -s --clear-cache create avd -n Nexus -f -k 'system-images;$API;google_api;x86'

/bin/bash