# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Copiar arquivos de dependência
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Build do projeto (Variaveis de ambiente para o build do Vite)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_OPENROUTER_API_KEY
ARG VITE_OPENROUTER_MODEL
# Fallbacks para nomes sem o prefixo VITE_ se necessário
ARG OPENROUTER_API_KEY
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-$SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY:-$SUPABASE_ANON_KEY}
ENV VITE_OPENROUTER_API_KEY=${VITE_OPENROUTER_API_KEY:-$OPENROUTER_API_KEY}
ENV VITE_OPENROUTER_MODEL=$VITE_OPENROUTER_MODEL

RUN npm run build

# Serve Stage
FROM nginx:alpine

# Copiar build da etapa anterior
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar configuração customizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expor porta 80
EXPOSE 80

# Iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]
