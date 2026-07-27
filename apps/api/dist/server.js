import { app } from './app.js';
import { ensureStorage } from './config/storage.js';
const PORT = 3001;
async function startServer() {
    await ensureStorage();
    app.listen(PORT, () => {
        console.log(`Harmonizer API disponible en http://localhost:${PORT}`);
    });
}
startServer().catch((error) => {
    console.error('No se ha podido iniciar Harmonizer API', error);
    process.exit(1);
});
