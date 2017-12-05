#!/bin/bash -e

#script will not run further on error
set -e

source ~/.bash_profile

# Run sshd
/usr/sbin/sshd

eval `ssh-agent -s`

echo "exec cat" > /root/ap-cat.sh

chmod a+x /root/ap-cat.sh

export DISPLAY=1

echo $1 | SSH_ASKPASS=/root/ap-cat.sh ssh-add ~/.ssh/id_rsa

rm /root/ap-cat.sh

#( sleep 4 && while [ 1 ]; do sleep 1; echo $1; done ) | ssh-add ~/.ssh/id_rsa

git pull

API=$2

if [[ $API -eq "" ]]; then
	API="android-21"
fi

echo "ANDROID API: $API"

yes | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 "platforms;$API" "sources;$API" "system-images;$API;google_apis;x86"

sdkmanager --sdk_root=/root/android-sdk/ --channel=0 --update

yes | sdkmanager --sdk_root=/root/android-sdk/ --licenses

echo no | avdmanager -s --clear-cache create avd -n Nexus -f -k "system-images;$API;google_apis;x86"

/bin/bash