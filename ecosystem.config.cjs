// Configuración PM2 para el backend de identidad de MRTI Core (Fase 1).
// Una sola instancia en modo fork: no hay estado compartido que justifique
// cluster, y evita condiciones de carrera en el rate-limiter en memoria.
module.exports = {
  apps: [
    {
      name: 'mrti-core-api',
      cwd: './server',          // dotenv carga server/.env desde aquí
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
