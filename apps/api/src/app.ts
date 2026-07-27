import cors from 'cors';
import express from 'express';

import { STORAGE_ROOT } from './config/storage.js';
import { errorHandler } from './middleware/errorHandler.js';
import { songsRouter } from './routes/songs.routes.js';

export const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin: 'http://localhost:5173',
  }),
);

app.use(express.json());

app.get(
  '/api/health',
  (_request, response) => {
    response.json({
      status: 'ok',
      service: 'harmonizer-api',
    });
  },
);

app.use(
  '/media',
  express.static(STORAGE_ROOT),
);

app.use('/api/songs', songsRouter);

app.use(
  '/api',
  (_request, response) => {
    response.status(404).json({
      message: 'Endpoint no encontrado',
    });
  },
);

app.use(errorHandler);