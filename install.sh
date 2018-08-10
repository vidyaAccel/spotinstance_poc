#!/bin/bash -e
set -e

export USER=ubuntu

#Remove the menu.lst config.
sudo rm /boot/grub/menu.lst
# Generate a new configuration file. 
sudo update-grub-legacy-ec2 -y
#repair dpkg
sudo dpkg --configure -a

# Android SDK for ubuntu.
email=vidyavsoman@gmail.com
name=vidyaAccel

DEBIAN_FRONTEND=noninteractive

echo "debconf shared/accepted-oracle-license-v1-1 select true" | sudo debconf-set-selections && \
echo "debconf shared/accepted-oracle-license-v1-1 seen true" | sudo debconf-set-selections

sudo dpkg --add-architecture i386

sudo apt update && apt -y upgrade

# Update packages
sudo apt update
sudo apt-get -y install software-properties-common zip unzip ssh net-tools openssh-server curl cpu-checker \
apt-transport-https ca-certificates python python-pip lsof virtualbox xrdp xfce4 xfce4-goodies tightvncserver

# Generate the keys and set permissions
ssh-keygen -b 2048 -t rsa -N "" -C "$email" -f "$HOME/.ssh/id_rsa"
sudo chmod 600 $HOME/.ssh/id_rsa
sudo chmod 600 $HOME/.ssh/id_rsa.pub

echo "    IdentityFile ~/.ssh/id_rsa" >> /etc/ssh/ssh_config

# Install JAVA and JDK
sudo add-apt-repository -y ppa:webupd8team/java
sudo apt-get update
sudo apt-get -y install openjdk-8-jdk

# Export JAVA_HOME variable
echo "export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64" >> $HOME/.profile && source $HOME/.profile
echo "export PATH=$PATH:$JAVA_HOME/bin" >> $HOME/.profile && source $HOME/.profile

# Adding user(ubuntu) to following groups
adduser $USER kvm
sudo usermod -a -G vboxusers $USER

# Install android sdk
curl -so $HOME/sdk-tools-linux.zip "https://dl.google.com/android/repository/sdk-tools-linux-3859397.zip" && \
unzip -o $HOME/sdk-tools-linux.zip -d $HOME/android-sdk/ && \
sudo rm -rf $HOME/sdk-tools-linux.zip

# Add android tools to PATH
echo "export ANDROID_HOME=$HOME/android-sdk" >> $HOME/.profile && source $HOME/.profile
echo "export PATH=$PATH:$ANDROID_HOME/tools" >> $HOME/.profile && source $HOME/.profile
echo "export PATH=$PATH:$ANDROID_HOME/tools/bin" >> $HOME/.profile && source $HOME/.profile

#Make repository file
mkdir $HOME/.android
touch $HOME/.android/repositories.cfg

# Generate android debug.keystore and release.keystore
sudo keytool -genkey -v -keystore $HOME/.android/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -sigalg SHA256withRSA -keysize 2048 -validity 3650 -dname "EMAILADDRESS=android@android.com, CN=Android Debug, OU=Android, O=Android, L=Mountain View, ST=California, C=US"
sudo keytool -genkey -v -keystore $HOME/.android/release.keystore -storepass android -alias androidreleasekey -keypass android -keyalg RSA -sigalg SHA256withRSA -keysize 2048 -validity 3650 -dname "EMAILADDRESS=android@android.com, CN=Android Release, OU=Android, O=Android, L=Mountain View, ST=California, C=US"

# Install latest android tools and system images and accept licenses
( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=$HOME/android-sdk/ --channel=0 \
"build-tools;27.0.1" \
"extras;android;m2repository" \
"extras;google;m2repository" \
"platform-tools"

( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=$HOME/android-sdk/ --licenses

sdkmanager --sdk_root=$HOME/android-sdk/ --channel=0 --update

echo "export PATH=$PATH:$ANDROID_HOME/platform-tools" >> $HOME/.profile && source $HOME/.profile
echo "export PATH=$PATH:$ANDROID_HOME/build-tools/27.0.1" >> $HOME/.profile && source $HOME/.profile

# Install latest Node.js
wget -qO- https://nodejs.org/dist/v8.9.1/node-v8.9.1-linux-x64.tar.xz | tar xvJ -C $HOME/ && \
sudo mv $HOME/node-v8.9.1-linux-x64 $HOME/node && \
sudo rm -rf $HOME/node-v8.9.1-linux-x64

# Add nodejs and npm PATH
echo "export PATH=$PATH:$HOME/node/bin" >> $HOME/.profile && source $HOME/.profile

cd $HOME

# # Install appium
# sudo apt update && sudo apt-get -y upgrade
# npm install -g appium --unsafe-perm=true
# npm install async

# # Install required python packages
# sudo pip install --upgrade pip
# sudo pip install Appium-Python-Client

#configure git
git config --global user.name "$name"
git config --global user.email "$email"

#Adding public key to github account
curl -u "$name" --data "{\"title\":\"spot-instance-key\",\"key\":\"`cat /$HOME/.ssh/id_rsa.pub`\"}" https://api.github.com/user/keys

# Run sshd and add ssh key
/usr/sbin/sshd
eval `ssh-agent -s`
ssh-add ~/.ssh/id_rsa

#start adb deamon
adb start-server

#Make xfce4 the default window manager for RDP connections.
echo xfce4-session> $HOME/.xsession
sudo cp $HOME/.xsession /etc/skel
sudo sed -i '0,/-1/s//ask-1/' /etc/xrdp/xrdp.ini
sudo service xrdp restart

#Install virtual box and components
cd $HOME
mkdir vbox
cd vbox
sudo service virtualbox start
wget http://download.virtualbox.org/virtualbox/5.0.40/Oracle_VM_VirtualBox_Extension_Pack-5.0.40-115130.vbox-extpack
echo y | VBoxManage extpack install Oracle_VM_VirtualBox_Extension_Pack-5.0.40-115130.vbox-extpack --replace



cd $HOME

#add github to ssh known_hosts
ssh -o StrictHostKeyChecking=no -a git@github.com

#clone repository
if [ ! -d "$HOME/spotinstance_poc" ]; then
    git clone git@github.com:vidyaAccel/spotinstance_poc.git
fi

cd spotinstance_poc/spotInstancePoc/testAgent/

git pull