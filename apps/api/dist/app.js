import path from 'node:path';
import { existsSync } from 'node:fs';
import cors from 'cors';
import express from 'express';
import { PROJECT_ROOT, STORAGE_ROOT } from './config/storage.js';
import { errorHandler } from './middleware/errorHandler.js';
import { songsRouter } from './routes/songs.routes.js';
export const app = express();
app.disable('x-powered-by');
app.use(cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
}));
app.use(express.json());
app.get('/api/health', (_request, response) => {
    response.json({
        status: 'ok',
        service: 'harmonizer-api',
    });
});
app.use('/media', express.static(STORAGE_ROOT));
app.use('/api/songs', songsRouter);
app.use('/api', (_request, response) => {
    response.status(404).json({
        message: 'Endpoint no encontrado',
    });
});
if (process.env.NODE_ENV === 'production') {
    const webDistPath = path.join(PROJECT_ROOT, 'apps/web/dist');
    if (existsSync(webDistPath)) {
        app.use(express.static(webDistPath));
        app.get(/^(?!\/api|\/media).*/, (_request, response) => {
            response.sendFile(path.join(webDistPath, 'index.html'));
        });
    }
}
app.use(errorHandler);
