import { Router } from 'express';
import { sessionRouter } from './auth/sessionRoutes.js';
import { profileRouter } from './auth/profileRoutes.js';
import { userAdminRouter } from './auth/userAdminRoutes.js';
import { accessControlRouter } from './auth/accessControlRoutes.js';
import { ticketContextRouter } from './auth/ticketContextRoutes.js';
import { provisioningRouter } from './auth/provisioningRoutes.js';
import { personalizationRouter } from './auth/personalizationRoutes.js';

// Composición del módulo de identidad:
// sesiones públicas, cuenta personal y administración de usuarios.
export const authRouter = Router();
authRouter.use(sessionRouter);
authRouter.use(profileRouter);
authRouter.use(userAdminRouter);
authRouter.use(accessControlRouter);
authRouter.use(ticketContextRouter);
authRouter.use(provisioningRouter);
authRouter.use(personalizationRouter);

export { authRequired, moduleAccessRequired } from './auth/shared.js';
