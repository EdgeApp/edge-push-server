FROM node:14.16.0-alpine3.13

EXPOSE 8008

# Install PM2
RUN npm install -g pm2

# PM2 log rotation
RUN pm2 install pm2-logrotate

# Set working directory to /usr/app
WORKDIR /usr/app

# Set logs directory
VOLUME [ "./logs" ]

# Copy dependency files
COPY package.json .
COPY yarn.lock .

# Install deps
RUN yarn install --ignore-scripts

# Copy project files
COPY pm2.json .
COPY src src/
COPY tsconfig.json .
COPY serverConfig.json .

# Compile
RUN yarn compile

# Run app
CMD [ "pm2-runtime", "pm2.json" ]