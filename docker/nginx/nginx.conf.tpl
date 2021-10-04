user  root;
worker_processes  1;

error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;


events {
    worker_connections  1024;
}


http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    sendfile        on;
    #tcp_nopush     on;

    keepalive_timeout  65;

    #gzip  on;

	upstream docker {
	  server unix:/var/run/docker.sock;
	}

	server {
		listen 80;

		add_header Access-Control-Allow-Origin * always;
		add_header Access-Control-Allow-Headers Content-Type always;
		add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
			
		location / {
			proxy_pass http://${APP_CONTAINER}:1337;
		}

		location ~ /websocket$ {
			proxy_pass http://${APP_CONTAINER}:1337;
			proxy_http_version 1.1;
			proxy_set_header Upgrade "websocket";
			proxy_set_header Connection "upgrade";
		}

		location /docker/ {
			rewrite /docker/(.*) /$1  break;
			proxy_pass http://docker;
			proxy_redirect     off;
		}

		location ~ /docker/.*ws/?$ {
			rewrite /docker/(.*) /$1  break;
			proxy_pass http://docker;
			proxy_http_version 1.1;
			proxy_set_header Upgrade "websocket";
			proxy_set_header Connection "upgrade";
		}
	}
}

