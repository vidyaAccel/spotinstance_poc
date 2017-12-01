# Android SDK for ubuntu.

FROM ubuntu:latest

ARG ssh_prv_key
ARG ssh_pub_key
ARG ssh_prv_key_pass

ENV DEBIAN_FRONTEND noninteractive
RUN echo "export DEBIAN_FRONTEND=noninteractive" >> /etc/profile

RUN echo "debconf shared/accepted-oracle-license-v1-1 select true" | debconf-set-selections && \
    echo "debconf shared/accepted-oracle-license-v1-1 seen true" | debconf-set-selections

RUN dpkg --add-architecture i386

RUN apt-get update
RUN apt-get -y install apt-utils sudo
RUN apt-get -y upgrade

# Update packages
RUN apt-get update && \
    apt-get -y install software-properties-common bzip2 ssh net-tools openssh-server socat curl cpu-checker qemu-kvm libvirt-bin ubuntu-vm-builder bridge-utils libc6:i386 libncurses5:i386 libstdc++6:i386 lib32z1 libbz2-1.0:i386

# Authorize SSH Host
RUN mkdir -p /root/.ssh && \
    chmod 0700 /root/.ssh && \
    ssh-keyscan github.com > /root/.ssh/known_hosts

# Add the keys and set permissions
RUN echo "$ssh_prv_key" > /root/.ssh/id_rsa && \
    echo "$ssh_pub_key" > /root/.ssh/id_rsa.pub && \
    chmod 600 /root/.ssh/id_rsa && \
    chmod 600 /root/.ssh/id_rsa.pub

RUN echo "    IdentityFile ~/.ssh/id_rsa" >> /etc/ssh/ssh_config

RUN apt-get -y install libglu1-mesa

# Install JAVA and JDK
RUN add-apt-repository -y ppa:webupd8team/java && \
    apt-get update && \
    apt-get -y install oracle-java8-installer

RUN adduser `id -un` kvm
RUN adduser `id -un` libvirtd

#Install latest node js
RUN wget -qO- https://nodejs.org/dist/v8.9.1/node-v8.9.1-linux-x64.tar.xz | tar xvJ -C $HOME/ && \
	mv $HOME/node-v8.9.1-linux-x64 $HOME/node && \
	rm -rf $HOME/node-v8.9.1-linux-x64 && \
	chown -R root:root $HOME/node/

# Add nodejs and npm PATH
ENV PATH $PATH:$HOME/node/bin

# Install android sdk
RUN curl -so $HOME/sdk-tools-linux.zip "https://dl.google.com/android/repository/sdk-tools-linux-3859397.zip" && \
    unzip -o $HOME/sdk-tools-linux.zip -d $HOME/android-sdk/ && \
    rm -rf $HOME/sdk-tools-linux.zip && \
	chown -R root:root $HOME/android-sdk/

# Export JAVA_HOME variable
ENV JAVA_HOME /usr/lib/jvm/java-8-oracle

# Add android tools and platform tools to PATH
ENV ANDROID_HOME $HOME/android-sdk
ENV PATH $PATH:$ANDROID_HOME/tools
ENV PATH $PATH:$ANDROID_HOME/tools/bin

RUN mkdir $HOME/.android
RUN touch $HOME/.android/repositories.cfg
RUN touch $HOME/.bash_profile

RUN echo "export PATH=$PATH:$HOME/node/bin" >> $HOME/.bash_profile && \
	echo "export JAVA_HOME=/usr/lib/jvm/java-8-oracle" >> $HOME/.bash_profile && \
    echo JAVA_HOME="/usr/lib/jvm/java-8-oracle" >> /etc/environment && \
    echo "export JAVA_HOME=/usr/lib/jvm/java-8-oracle" >> $HOME/.bash_profile && \
	echo "export ANDROID_HOME=$HOME/android-sdk" >> $HOME/.bash_profile && \
	echo "export PATH=$PATH:$ANDROID_HOME/tools" >> $HOME/.bash_profile && \
    echo "export PATH=$PATH:$ANDROID_HOME/tools/bin" >> $HOME/.bash_profile && \

# Generate android debug.keystore
RUN keytool -genkey -v -keystore $HOME/.android/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US"
RUN keytool -exportcert -keystore $HOME/.android/debug.keystore -storepass android -alias androiddebugkey -file $HOME/.android/androiddebugkey.crt

RUN /bin/bash -c "source $HOME/.bash_profile"

# Install latest android tools and system images
RUN ( sleep 4 && while [ 1 ]; do sleep 1; echo y; done ) | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 \
    "build-tools;27.0.1" "platform-tools" "tools" "emulator" \
    "extras;android;m2repository" "extras;google;m2repository" "extras;google;google_play_services" && \
    echo "y"

RUN rm -rf $ANDROID_HOME/tools/emulator

RUN echo "export PATH=$PATH:$ANDROID_HOME/platform-tools" >> $HOME/.bash_profile && \
    echo "export PATH=$PATH:$ANDROID_HOME/emulator" >> $HOME/.bash_profile

RUN apt-get -y install git python

RUN mkdir /var/run/sshd && \
    echo 'root:root' | chpasswd && \
    sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config

# SSH login fix.
RUN sed 's@session\s*required\s*pam_loginuid.so@session optional pam_loginuid.so@g' -i /etc/pam.d/sshd

ENV NOTVISIBLE "in users profile"
RUN echo "export VISIBLE=now" >> /etc/profile

RUN /bin/bash -c "source /etc/profile"
RUN /bin/bash -c "source $HOME/.bash_profile"

RUN npm install -g aws-sdk

# Expose control ports
EXPOSE 22
EXPOSE 80
EXPOSE 443
EXPOSE 9070

WORKDIR /root
RUN git clone git@github.com:IPGPTP/spotinstance_poc.git

WORKDIR /root/spotinstance_poc/spotInstancePoc/testAgent
RUN git pull

RUN chmod +x pocRunner.sh

CMD ["/bin/bash", "pocRunner.sh"]