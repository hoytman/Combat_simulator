FROM nginx:alpine
COPY nginx-no-cache.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY rev_log.txt /usr/share/nginx/html/
EXPOSE 80
