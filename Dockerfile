FROM ubuntu:18.04

RUN apt-get update \  
&& apt-get install cron -y \
&& apt-get install transmission-cli transmission-common transmission-daemon -y

RUN touch transmission-dh_debug.log

ADD config.sh /config.sh
ADD transmission-DH.sh /script.sh

RUN chmod 0744 /script.sh
RUN chmod 0744 /config.sh

RUN crontab -l | { cat; echo "0 1 * * * bash /script.sh"; } | crontab -

# Running commands for the startup of a container.
CMD cron
