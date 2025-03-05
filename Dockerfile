FROM node:22.14.0-alpine3.21

# working directory inside the container
WORKDIR /usr/src/app

# install dependencies
COPY package*.json ./
RUN npm install

# copy the app code
COPY . .

# Expose port 3000 for the API
EXPOSE 3000

# Start the app on launch of the container
CMD [ "npm", "start" ]
