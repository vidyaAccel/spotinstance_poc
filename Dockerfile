FROM ubuntu:latest
MAINTAINER vidya "vidyavsoman@gmail.com"
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get -y install imagemagick
RUN apt-get -y install nodejs
RUN apt-get -y install git
RUN apt-get -y install python
RUN npm install aws-sdk
RUN git clone https://github.com/vidyaAccel/spotinstance_poc.git
WORKDIR /home/spotinstance_poc/spotInstancePoc/testAgent
RUN git pull
EXPOSE 80
RUN chmod 777 cc.sh
CMD ["./cc.sh"]