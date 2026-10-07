FROM denoland/deno:2.9.7

WORKDIR /app

COPY deno.json ./
COPY main.ts ./
COPY src ./src
COPY tests ./tests

RUN deno cache main.ts

ENV PORT=8080
ENV ENABLE_KV=false

EXPOSE 8080

CMD ["run", "--allow-net", "--allow-env", "main.ts"]
