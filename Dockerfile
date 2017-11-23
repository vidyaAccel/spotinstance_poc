FROM spotpoc/poc:v4
MAINTAINER vidya "vidyavsoman@gmail.com"
RUN git clone https://github.com/vidyaAccel/spotinstance_poc.git
WORKDIR /home/spotinstance_poc/spotInstancePoc/testAgent
RUN git pull
EXPOSE 80
RUN npm install aws-sdk
RUN chmod 777 cc.sh
CMD ["./cc.sh"]