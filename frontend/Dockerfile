# Stage 1: Build the Angular Application
FROM node:20-alpine AS builder

WORKDIR /app

# For now, we simulate an Angular build if package.json doesn't exist
# so that the docker-compose can be tested
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build -- --configuration production

# Stage 2: Serve the app with Nginx
FROM nginx:alpine

# Copy the build output to replace the default nginx contents.
# Note: Angular 17+ creates dist/<project-name>/browser by default. 
COPY --from=builder /app/dist/ares-frontend/browser /usr/share/nginx/html

# Copy our custom nginx configuration for reverse proxy and SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
