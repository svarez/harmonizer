const ADMIN_TOKEN_HEADER = 'X-Harmonizer-Admin-Token';
export const requireAdminAccess = (request, response, next) => {
    const configuredToken = process.env.HARMONIZER_ADMIN_TOKEN?.trim();
    const providedToken = request
        .get(ADMIN_TOKEN_HEADER)
        ?.trim();
    if (!configuredToken ||
        providedToken !== configuredToken) {
        response.status(403).json({
            message: 'No tienes permisos para usar las herramientas de sincronización',
        });
        return;
    }
    next();
};
