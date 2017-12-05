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

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 "platforms;$API" "sources;$API" "system-images;$API;google_apis;x86"

sdkmanager --sdk_root=/root/android-sdk/ --channel=0 --update

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --licenses

echo no | avdmanager -s --clear-cache create avd -n Nexus -f -k "system-images;$API;google_apis;x86"

# Detect ip and forward ADB ports outside to outside interface
ip=$(ifconfig  | grep 'inet addr:'| grep -v '127.0.0.1' | cut -d: -f2 | awk '{ print $1}')
socat TCP-LISTEN:5554,bind=$ip,fork tcp:127.0.0.1:5554
socat TCP-LISTEN:5555,bind=$ip,fork tcp:127.0.0.1:5555
socat TCP-LISTEN:80,bind=$ip,fork tcp:127.0.0.1:80
socat TCP-LISTEN:443,bind=$ip,fork tcp:127.0.0.1:443

/bin/bash
