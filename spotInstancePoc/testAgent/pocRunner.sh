#!/bin/bash
source ~/.bash_profile

# Run sshd
/usr/sbin/sshd

git pull

if [[ $API -eq "" ]]
then
	API="android-21"
fi

echo "ANDROID API: $API"

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 \
    "platforms;$API" "sources;$API" "system-images;$API;google_api;x86" && \
    echo "y"

sdkmanager --sdk_root=/root/android-sdk/ --channel=0 --update

( sleep 4 && while [ 1 ]; do sleep 1; echo no; done ) | avdmanager -s --clear-cache create avd -n Nexus -f -k 'system-images;$API;google_api;x86' && echo "no"

node ./job/job.js