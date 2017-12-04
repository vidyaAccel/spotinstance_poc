#!/bin/bash
source ~/.bash_profile

# Run sshd
/usr/sbin/sshd

eval `ssh-agent -s`

( sleep 4 && while [ 1 ]; do sleep 1; echo $1; done ) | ssh-add ~/.ssh/id_rsa

git pull

API=$2

if [[ $API -eq "" ]]; then
	API="android-21"
fi

echo "ANDROID API: $API"

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 \
    "platforms;$API" "sources;$API" "system-images;$API;google_apis;x86"

sdkmanager --sdk_root=/root/android-sdk/ --channel=0 --update

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --licenses

( sleep 4 && while [ 1 ]; do sleep 1; echo no; done ) | avdmanager -s --clear-cache create avd -n Nexus -f -k 'system-images;$API;google_api;x86'

/bin/bash