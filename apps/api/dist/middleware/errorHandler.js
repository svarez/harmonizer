import multer from 'multer';
import { ZodError } from 'zod';
export const errorHandler = (error, _request, response, _next) => {
    console.error(error);
    if (error instanceof ZodError) {
        response.status(400).json({
            message: 'Los datos enviados no son válidos',
            errors: error.issues,
        });
        return;
    }
    if (error instanceof multer.MulterError) {
        response.status(400).json({
            message: error.message,
            code: error.code,
        });
        return;
    }
    if (error instanceof Error) {
        response.status(400).json({
            message: error.message,
        });
        return;
    }
    response.status(500).json({
        message: 'Error interno del servidor',
    });
};
