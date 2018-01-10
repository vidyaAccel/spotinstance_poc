#!/bin/bash -e

#script will not run further on error
set -e

# Run sshd and add ssh key
/usr/sbin/sshd
eval `ssh-agent -s`
echo "exec cat" > /root/ap-cat.sh
chmod a+x /root/ap-cat.sh
export DISPLAY=1
echo $PASS | SSH_ASKPASS=/root/ap-cat.sh ssh-add ~/.ssh/id_rsa
rm /root/ap-cat.sh

touch /root/package.txt
find /root/android-sdk/ -name package.xml -exec sh -c 'eval $(xmllint --xpath "//*[local-name()='\'localPackage\'']/@path" $0) && echo $path' {} \; | grep "system-images" | cut -f1 > /root/package.txt

#start adb deamon
adb start-server

echo "Available System Images:"
cat /root/package.txt

# clone spotinstance_poc repo from github
cd /root

if [ ! -d "/root/spotinstance_poc" ]; then
  	git clone git@github.com:vidyaAccel/spotinstance_poc.git
fi

cd spotinstance_poc/spotInstancePoc/testAgent/

git pull

echo no | avdmanager -s --clear-cache create avd -n Nexus -f -k "system-images;android-22;google_apis;x86"

chmod +x ./cc.sh

./cc.sh

#Prevent container from terminating
$SHELL
