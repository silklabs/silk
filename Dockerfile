FROM node:4.3

RUN apt-get update && apt-get install build-essential -y
RUN mkdir /workspace
ADD src /src
ENTRYPOINT [ "/src/build.sh" ]
