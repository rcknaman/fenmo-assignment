# use node image
FROM node:20-slim

# set working directory
WORKDIR /app

# copy package.json and package-lock.json
COPY package*.json ./

# install dependencies
RUN npm install --production

# copy source code
COPY . .

# expose port
EXPOSE 3000

# start application
CMD ["node", "index.js"]
