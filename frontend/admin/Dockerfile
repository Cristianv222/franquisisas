FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

# El puerto real lo fija docker-compose (--port 5173).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
