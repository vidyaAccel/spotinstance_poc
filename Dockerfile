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
RUN wget -qO- https://nodejs.org/dist/v8.9.1/node-v8.9.1-linux-x64.tar.xz | tar xvJ -C /root/ && \
	mv /root/node-v8.9.1-linux-x64 /root/node && \
	rm -rf /root/node-v8.9.1-linux-x64 && \
	chown -R root:root /root/node/

# Add nodejs and npm PATH
ENV PATH $PATH:/root/node/bin

# Install android sdk
RUN curl -so /root/sdk-tools-linux.zip "https://dl.google.com/android/repository/sdk-tools-linux-3859397.zip" && \
    unzip -o /root/sdk-tools-linux.zip -d /root/android-sdk/ && \
    rm -rf /root/sdk-tools-linux.zip && \
	chown -R root:root /root/android-sdk/

# Export JAVA_HOME variable
ENV JAVA_HOME /usr/lib/jvm/java-8-oracle

# Add android tools and platform tools to PATH
ENV ANDROID_HOME /root/android-sdk
ENV PATH $PATH:$ANDROID_HOME/tools
ENV PATH $PATH:$ANDROID_HOME/tools/bin

RUN mkdir /root/.android
RUN touch /root/.android/repositories.cfg
RUN touch /root/.bash_profile && \
    echo "[[ -s "$HOME/.profile" ]] && source "$HOME/.profile" # Load the default .profile" >> /root/.bash_profile

RUN echo "export PATH=$PATH:/root/node/bin" >> /root/.bash_profile && \
	echo "export JAVA_HOME=/usr/lib/jvm/java-8-oracle" >> /root/.bash_profile && \
    echo JAVA_HOME="/usr/lib/jvm/java-8-oracle" >> /etc/environment && \
	echo "export ANDROID_HOME=/root/android-sdk" >> /root/.bash_profile && \
	echo "export PATH=$PATH:$ANDROID_HOME/tools" >> /root/.bash_profile && \
    echo "export PATH=$PATH:$ANDROID_HOME/tools/bin" >> /root/.bash_profile

# Generate android debug.keystore
RUN keytool -genkey -v -keystore /root/.android/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US"
RUN keytool -exportcert -keystore /root/.android/debug.keystore -storepass android -alias androiddebugkey -file /root/.android/androiddebugkey.crt

RUN /bin/bash -c "source /root/.bash_profile"

# Install latest android tools and system images
RUN yes | sdkmanager --sdk_root=/root/android-sdk/ --channel=0 \
    "build-tools;27.0.1" "platform-tools" "tools" "emulator" \
    "extras;android;m2repository" "extras;google;m2repository" "extras;google;google_play_services"

RUN rm -rf $ANDROID_HOME/tools/emulator

RUN echo "export PATH=$PATH:$ANDROID_HOME/platform-tools" >> /root/.bash_profile && \
    echo "export PATH=$PATH:$ANDROID_HOME/emulator" >> /root/.bash_profile

RUN apt-get -y install git python

RUN mkdir /var/run/sshd && \
    echo 'root:root' | chpasswd && \
    sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config

# SSH login fix.
RUN sed 's@session\s*required\s*pam_loginuid.so@session optional pam_loginuid.so@g' -i /etc/pam.d/sshd

ENV NOTVISIBLE "in users bash_profile"
RUN echo "export VISIBLE=now" >> /etc/bash_profile

RUN /bin/bash -c "source /etc/profile"
RUN /bin/bash -c "source /root/.bash_profile"

# Expose control ports and adb ports
EXPOSE 22
EXPOSE 80
EXPOSE 443
EXPOSE 5554
EXPOSE 5555

WORKDIR /root

RUN npm i aws-sdk appium

COPY sshRunner.sh /root/runSsh.sh

RUN chmod +x /root/runSsh.sh

RUN /bin/bash ~/runSsh.sh $ssh_prv_key_pass

WORKDIR /root/spotinstance_poc/spotInstancePoc/testAgent

RUN chmod +x pocRunner.sh

CMD ["sh", "-c", "/bin/bash pocRunner.sh $PASS $API"]