# Gateway AI của EduGame Studio (#359).
#
# Vì sao có tệp này: bản cài trên máy giáo viên phải trỏ tới một gateway THẬT, không phải
# `127.0.0.1`. Dockerfile này chỉ đóng gói `server/` — không chứa khoá nào; khoá đến từ
# biến môi trường của nơi chạy, đúng như `docs/DEPLOY_GATEWAY.md` mô tả.
#
# Không dùng image `node:22-slim` rồi `npm install` toàn bộ: gateway chỉ cần 4 phụ thuộc
# (`express`, `express-rate-limit`, `@supabase/supabase-js`, `zod`), nên cài đúng chúng để
# image nhỏ và ít bề mặt tấn công.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# `--omit=dev` vì TypeScript chỉ cần lúc biên dịch ở máy dựng, không cần trong image chạy.
RUN npm ci --omit=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY server ./server
RUN npx --yes typescript@5 tsc -p tsconfig.json

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/server ./dist/server
COPY package.json ./
# Chạy bằng người dùng không phải root: một lỗi trong gateway không được là lỗi của cả máy.
USER node
EXPOSE 8787
ENV PORT=8787
# Ứng dụng trả `{ok:true,...}` ở `/health`; nơi chạy dùng nó để biết khi nào được nhận traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
