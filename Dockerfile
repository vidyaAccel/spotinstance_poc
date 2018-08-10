# Android SDK for ubuntu.

FROM ubuntu:latest

ARG email
ARG pass
ARG name
ARG gitpass

ENV PASS=$pass

#set shell
ENV SHELL=/bin/bash

ENV DEBIAN_FRONTEND noninteractive

RUN echo "debconf shared/accepted-oracle-license-v1-1 select true" | debconf-set-selections && \
    echo "debconf shared/accepted-oracle-license-v1-1 seen true" | debconf-set-selections

RUN dpkg --add-architecture i386

RUN apt-get update
RUN apt-get -y install apt-utils sudo
RUN apt-get -y upgrade

# Update packages
RUN apt-get update && \
    apt-get -y install software-properties-common bzip2 ssh net-tools openssh-server socat curl cpu-checker qemu qemu-kvm libvirt-bin ubuntu-vm-builder bridge-utils libc6:i386 libncurses5:i386 libstdc++6:i386 lib32z1 libbz2-1.0:i386

# Authorize SSH Host
RUN mkdir -p /root/.ssh && \
    chmod 0700 /root/.ssh

# Generate the keys and set permissions
RUN ssh-keygen -b 2048 -t rsa -C $email -N $PASS -f /root/.ssh/id_rsa && \
    chmod 600 /root/.ssh/id_rsa && \
    chmod 600 /root/.ssh/id_rsa.pub

RUN echo "    IdentityFile ~/.ssh/id_rsa" >> /etc/ssh/ssh_config

RUN apt-get -y install libglu1-mesa

# Install JAVA and JDK
RUN add-apt-repository -y ppa:webupd8team/java && \
    apt-get update && \
    apt-get -y install oracle-java8-installer

# Export JAVA_HOME variable
ENV JAVA_HOME /usr/lib/jvm/java-8-oracle
ENV PATH $PATH:$JAVA_HOME/bin

# Adding user(root) to following groups
RUN adduser `id -un` kvm
RUN adduser `id -un` libvirtd

# Install android sdk
RUN curl -so /root/sdk-tools-linux.zip "https://dl.google.com/android/repository/sdk-tools-linux-3859397.zip" && \
    unzip -o /root/sdk-tools-linux.zip -d /root/android-sdk/ && \
    rm -rf /root/sdk-tools-linux.zip && \
	chown -R root:root /root/android-sdk/

# Add android tools to PATH
ENV ANDROID_HOME /root/android-sdk
ENV PATH $PATH:$ANDROID_HOME/tools
ENV PATH $PATH:$ANDROID_HOME/tools/bin

#Make repository file
RUN mkdir /root/.android
RUN touch /root/.android/repositories.cfg

# Generate android debug.keystore and release.keystore
RUN keytool -genkey -v -keystore /root/.android/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -sigalg SHA256withRSA -keysize 2048 -validity 3650 -dname "EMAILADDRESS=android@android.com, CN=Android Debug, OU=Android, O=Android, L=Mountain View, ST=California, C=US"
RUN keytool -genkey -v -keystore /root/.android/release.keystore -storepass android -alias androidreleasekey -keypass android -keyalg RSA -sigalg SHA256withRSA -keysize 2048 -validity 3650 -dname "EMAILADDRESS=android@android.com, CN=Android Release, OU=Android, O=Android, L=Mountain View, ST=California, C=US"

#Import packagelist files
COPY package_list.txt /root/android-sdk/package_list.txt

# Install latest android tools and system images and accept licenses
RUN ( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 --package_file=/root/android-sdk/package_list.txt

RUN ( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --licenses

RUN sdkmanager --sdk_root=/root/android-sdk/ --channel=0 --update

RUN rm -rf $ANDROID_HOME/tools/emulator

RUN cp -rf /root/android-sdk/emulator/emulator /root/android-sdk/tools/emulator

ENV PATH $PATH:$ANDROID_HOME/platform-tools
ENV PATH $PATH:$ANDROID_HOME/emulator
ENV PATH $PATH:$ANDROID_HOME/build-tools/27.0.1

# Install latest Node.js
RUN wget -qO- https://nodejs.org/dist/v8.9.1/node-v8.9.1-linux-x64.tar.xz | tar xvJ -C /root/ && \
    mv /root/node-v8.9.1-linux-x64 /root/node && \
    rm -rf /root/node-v8.9.1-linux-x64 && \
    chown -R root:root /root/node/

# Add nodejs and npm PATH
ENV PATH $PATH:/root/node/bin

RUN mkdir /var/run/sshd && \
    echo 'root:$PASS' | chpasswd && \
    sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config

# SSH login fix.
RUN sed 's@session\s*required\s*pam_loginuid.so@session optional pam_loginuid.so@g' -i /etc/pam.d/sshd

ENV NOTVISIBLE "in users bash_profile"

RUN /bin/bash -c "source /etc/profile"

WORKDIR /root

# Install python and appium
RUN apt-get update && apt-get -y upgrade && apt-get -y install python python-pip lsof
RUN npm install -g appium --unsafe-perm=true --allow-root
RUN npm install async

# Install required python packages
RUN pip install --upgrade pip
RUN pip install Appium-Python-Client

#Install and configure git
RUN apt-get -y install git git-svn subversion
RUN git config --global user.name "$name"
RUN git config --global user.email "$email"

#Adding public key to github account
RUN curl -u "$name:$gitpass" --data "{\"title\":\"spot-instance-docker-key\",\"key\":\"`cat /root/.ssh/id_rsa.pub`\"}" https://api.github.com/user/keys

# Expose control ports, vnc ports, and appium ports
EXPOSE 22
EXPOSE 80
EXPOSE 443
EXPOSE 5900
EXPOSE 9070

COPY runContainer.sh /root/runContainer.sh

RUN chmod +x /root/runContainer.sh

CMD ["/root/runContainer.sh"]