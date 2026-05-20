/** Port backend NestJS ở dev. Mặc định 3010 để tránh xung đột với Docker/cattshop (3001). */
export const GENPOSTER_BACKEND_PORT = Number(process.env.GENPOSTER_BACKEND_PORT) || 3010;

export const GENPOSTER_FRONTEND_PORT = Number(process.env.GENPOSTER_FRONTEND_PORT) || 9090;
