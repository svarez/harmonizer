import { app } from './app.js';
import { ensureStorage, } from './config/storage.js';
import { prisma, } from './lib/prisma.js';
const PORT = 3001;
async function startServer() {
    await ensureStorage();
    const server = app.listen(PORT, () => {
        console.log(`Harmonizer API disponible en http://localhost:${PORT}`);
    });
    const shutdown = async (signal) => {
        console.log(`\nRecibida señal ${signal}. Cerrando backend...`);
        server.close(async () => {
            await prisma.$disconnect();
            console.log('Backend y base de datos cerrados');
            process.exit(0);
        });
    };
    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });
}
startServer().catch(async (error) => {
    console.error('No se ha podido iniciar Harmonizer API', error);
    await prisma.$disconnect();
    process.exit(1);
});
